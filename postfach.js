/* „Mein Bereich": Beitrag anzeigen + löschen und Postfach lesen —
   ausschließlich mit dem geheimen Link. Der private Schlüssel steckt IM
   Link (hinter dem #, das nie an einen Server geht) und wird auch im
   Browser-Gedächtnis gespeichert. Entschlüsselt wird hier im Browser. */

(function () {
  'use strict';

  var POSTFACH_KEY = 'fundbueroPostfaecher';
  var letzterToken = '';
  var letzterSchluessel = '';

  function konfiguration() {
    return (typeof window !== 'undefined' && window.FUNDBUERO_CONFIG) ? window.FUNDBUERO_CONFIG : {};
  }

  function basis() {
    var url = konfiguration().supabaseUrl;
    return String(url == null ? '' : url).trim().replace(/\/+$/, '');
  }

  function anon() {
    var key = konfiguration().supabaseAnonKey;
    return String(key == null ? '' : key).trim();
  }

  function konfiguriert() {
    return basis() !== '' && anon() !== '';
  }

  function header(zusatz) {
    var kopf = { apikey: anon(), Authorization: 'Bearer ' + anon() };
    var extra = zusatz || {};
    Object.keys(extra).forEach(function (name) { kopf[name] = extra[name]; });
    return kopf;
  }

  function rpc(name, koerper) {
    return fetch(basis() + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: header({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(koerper)
    }).then(function (antwort) {
      if (!antwort.ok) { throw new Error('HTTP ' + antwort.status); }
      return antwort.json();
    });
  }

  function leseMeine() {
    try {
      var roh = localStorage.getItem(POSTFACH_KEY);
      var liste = roh ? JSON.parse(roh) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (e) {
      return [];
    }
  }

  function entferneAusMeine(token) {
    var liste = leseMeine().filter(function (eintrag) { return eintrag.token !== token; });
    try { localStorage.setItem(POSTFACH_KEY, JSON.stringify(liste)); } catch (e) { /* egal */ }
  }

  function setzeStatus(text, erfolg) {
    var status = document.getElementById('postfachStatus');
    if (!status) { return; }
    status.textContent = text;
    status.classList.toggle('ok', !!erfolg);
  }

  function zeigeMeine() {
    var box = document.getElementById('postfachMeine');
    if (!box) { return; }
    box.textContent = '';
    var meine = leseMeine();
    if (!meine.length) { return; }

    var titel = document.createElement('h2');
    titel.textContent = 'Meine Beiträge (auf diesem Gerät)';
    box.appendChild(titel);

    meine.forEach(function (eintrag) {
      var zeile = document.createElement('div');
      zeile.className = 'postfachItem';

      var meta = document.createElement('div');
      meta.className = 'postfachMeta';
      var modusText = eintrag.modus === 'offen' ? 'offener Kontakt' : 'anonymes Postfach';
      meta.textContent = eintrag.nr + ' · ' + modusText + (eintrag.titel ? (' · „' + eintrag.titel + '…“') : '') +
        (eintrag.privat ? ' · Schlüssel lokal gemerkt' : '');

      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'pill';
      knopf.textContent = 'Öffnen';
      knopf.addEventListener('click', function () { oeffne(eintrag.token, eintrag.privat || ''); });

      zeile.appendChild(meta);
      zeile.appendChild(knopf);
      box.appendChild(zeile);
    });
  }

  function oeffne(token, privat) {
    var ziel = '#' + token + (privat ? ('~' + privat) : '');
    if (window.location.hash !== ziel) {
      window.location.hash = ziel.slice(1) ? (token + (privat ? ('~' + privat) : '')) : '';
    }
    ladeBereich(token, privat);
  }

  function ladeBereich(token, privat) {
    var kopfBox = document.getElementById('beitragKopf');
    var liste = document.getElementById('postfachListe');
    if (!kopfBox || !liste) { return; }
    kopfBox.textContent = '';
    liste.textContent = '';

    if (!konfiguriert()) {
      setzeStatus('Das Amt ist noch nicht angeschlossen … Bald geht\'s los!', false);
      return;
    }
    if (!token) {
      setzeStatus('Kein Postfach-Code — bitte füge deinen Postfach-Link ein.', false);
      return;
    }
    letzterToken = token;
    letzterSchluessel = privat || '';
    setzeStatus('Wird geöffnet …', false);

    rpc('beitrag_info', { p_token: token }).then(function (daten) {
      var beitrag = Array.isArray(daten) ? daten[0] : null;
      if (!beitrag) {
        setzeStatus('Dazu finde ich nichts — ist der Link komplett?', false);
        return;
      }

      kopfBox.appendChild(baueBeitragKopf(token, beitrag));
      if (beitrag.kontakt_modus === 'postfach' && !privat) {
        var tip = document.createElement('div');
        tip.className = 'postfachMeta';
        tip.textContent = 'Hinweis: Ohne den vollständigen Link (mit Schlüssel) bleiben die Antworten verschlüsselt.';
        kopfBox.appendChild(tip);
      }

      var nummer = 'Nr. ' + FundbueroLogik.formatNummer(beitrag.id, beitrag.created_at);
      if (beitrag.kontakt_modus === 'postfach') {
        return leseNachrichten(token).then(function (nachrichten) {
          if (!nachrichten.length) {
            setzeStatus(nummer + ': Noch keine Antworten — die Lupe hält die Augen offen.', false);
            return;
          }
          setzeStatus(
            nummer + ': ' + nachrichten.length + (nachrichten.length === 1 ? ' verschlüsselte Nachricht' : ' verschlüsselte Nachrichten'),
            true
          );
          return entschluessleAlle(nachrichten, privat).then(function (paare) {
            paare.forEach(function (paar) {
              liste.appendChild(baueNachricht(token, paar.nachricht, paar.klar, paar.fehler));
            });
          });
        });
      }

      setzeStatus(nummer + ': Offener Kontakt — Antworten kommen direkt bei dir an (z. B. per E-Mail).', true);
      return null;
    }).catch(function () {
      setzeStatus('Konnte nicht geöffnet werden — ist der Link komplett?', false);
    });
  }

  function leseNachrichten(token) {
    return rpc('nachrichten_lesen', { p_token: token }).then(function (daten) {
      return Array.isArray(daten) ? daten : [];
    });
  }

  // Alle Nachrichten im Browser entschlüsseln (private key aus dem Link).
  function entschluessleAlle(nachrichten, privat) {
    if (typeof FundbueroKrypto === 'undefined' || !FundbueroKrypto.unterstuetzt()) {
      return Promise.resolve(nachrichten.map(function (n) {
        return { nachricht: n, klar: null, fehler: 'Dein Browser kann die Verschlüsselung nicht.' };
      }));
    }
    if (!privat) {
      return Promise.resolve(nachrichten.map(function (n) {
        return { nachricht: n, klar: null, fehler: 'Schlüssel fehlt — öffne das Postfach über den vollständigen Link.' };
      }));
    }
    return Promise.all(nachrichten.map(function (n) {
      return FundbueroKrypto.entschluessle(privat, n.inhalt)
        .then(function (klar) { return { nachricht: n, klar: klar, fehler: null }; })
        .catch(function () { return { nachricht: n, klar: null, fehler: 'Konnte nicht entschlüsselt werden.' }; });
    }));
  }

  function baueBeitragKopf(token, beitrag) {
    var box = document.createElement('div');
    box.className = 'beitragKopf';

    var nr = document.createElement('b');
    nr.textContent = 'Nr. ' + FundbueroLogik.formatNummer(beitrag.id, beitrag.created_at) + ' · ';

    var text = document.createElement('span');
    var inhalt = String(beitrag.text == null ? '' : beitrag.text);
    text.textContent = inhalt.length > 90 ? (inhalt.slice(0, 90) + '…') : inhalt;

    box.appendChild(nr);
    box.appendChild(text);

    if (beitrag.laeuft_ab_am) {
      var ablauf = document.createElement('div');
      ablauf.className = 'postfachMeta';
      ablauf.textContent = 'Läuft ab am ' + FundbueroLogik.formatDatum(beitrag.laeuft_ab_am) +
        ' — danach verschwindet der Beitrag aus Liste und Karte.';
      box.appendChild(ablauf);
    }

    var loeschen = document.createElement('button');
    loeschen.type = 'button';
    loeschen.className = 'pill pillGefahr';
    if (typeof FundbueroIcons !== 'undefined') { loeschen.appendChild(FundbueroIcons.baue('muell', 14)); }
    loeschen.appendChild(document.createTextNode(' Beitrag löschen'));
    loeschen.addEventListener('click', function () { loescheBeitrag(token, beitrag.id); });

    box.appendChild(document.createElement('br'));
    box.appendChild(loeschen);
    return box;
  }

  function loescheBeitrag(token, id) {
    if (!window.confirm('Beitrag wirklich löschen? Auch alle (verschlüsselten) Antworten verschwinden damit.')) {
      return;
    }
    rpc('meldung_loeschen', { p_token: token }).then(function (daten) {
      if (daten && daten.ok === false) {
        setzeStatus(String(daten.fehler || 'Löschen ging nicht.'), false);
        return;
      }
      entferneAusMeine(token);
      var kopfBox = document.getElementById('beitragKopf');
      var liste = document.getElementById('postfachListe');
      if (kopfBox) { kopfBox.textContent = ''; }
      if (liste) { liste.textContent = ''; }
      setzeStatus('Beitrag gelöscht — tschüss, Nr. ' + id + '! Die Lupe wird ihn vermissen.', true);
      zeigeMeine();
    }).catch(function () {
      setzeStatus('Löschen ging nicht — nochmal probieren.', false);
    });
  }

  // Eine Nachricht als Karte: entschlüsselt (Name/E-Mail/Text) oder mit
  // Hinweis, warum es nicht ging. Löschen ist immer möglich.
  function baueNachricht(token, nachricht, klar, fehler) {
    var karte = document.createElement('div');
    karte.className = 'postfachItem';

    var meta = document.createElement('div');
    meta.className = 'postfachMeta';

    if (klar) {
      var name = String(klar.name == null ? '' : klar.name).trim();
      var email = String(klar.email == null ? '' : klar.email).trim();
      meta.appendChild(document.createTextNode(
        (name || 'Anonym') + ' · ' + FundbueroLogik.formatDatum(nachricht.created_at) + ' · '
      ));
      if (email) {
        var link = document.createElement('a');
        link.href = 'mailto:' + email;
        link.textContent = email;
        meta.appendChild(link);
      }
    } else {
      meta.appendChild(document.createTextNode(
        FundbueroLogik.formatDatum(nachricht.created_at) + ' · '
      ));
      var hinweis = document.createElement('span');
      hinweis.textContent = fehler || 'Konnte nicht entschlüsselt werden.';
      meta.appendChild(hinweis);
    }

    karte.appendChild(meta);

    if (klar) {
      var text = document.createElement('div');
      text.className = 'postfachText';
      text.textContent = String(klar.nachricht == null ? '' : klar.nachricht);
      karte.appendChild(text);
    }

    var loeschen = document.createElement('button');
    loeschen.type = 'button';
    loeschen.className = 'pill';
    if (typeof FundbueroIcons !== 'undefined') { loeschen.appendChild(FundbueroIcons.baue('muell', 14)); }
    loeschen.appendChild(document.createTextNode(' Löschen'));
    loeschen.addEventListener('click', function () { loescheNachricht(token, nachricht.id); });

    karte.appendChild(loeschen);
    return karte;
  }

  function loescheNachricht(token, id) {
    rpc('nachricht_loeschen', { p_token: token, p_id: id }).then(function () {
      var teile = tokenUndSchluesselAusHash();
      ladeBereich(token, teile.privat);
    }).catch(function () {
      setzeStatus('Löschen ging nicht — nochmal probieren.', false);
    });
  }

  function tokenUndSchluesselAusHash() {
    var hash = String(window.location.hash || '');
    if (hash.length < 2) { return { token: '', privat: '' }; }
    var teile = hash.slice(1).split('~');
    return { token: teile[0] || '', privat: teile[1] || '' };
  }

  function oeffneFeld() {
    var feld = document.getElementById('tokenFeld');
    var eingabe = feld ? feld.value.trim() : '';
    // Erlaubt das Einfügen des kompletten Links (…#token~schlüssel).
    var treffer = eingabe.match(/#([0-9a-fA-F-]{36})(?:~([A-Za-z0-9_-]+))?\s*$/);
    var token = treffer ? treffer[1] : eingabe;
    var privat = treffer && treffer[2] ? treffer[2] : '';
    if (token) {
      window.location.hash = token + (privat ? ('~' + privat) : '');
    }
    ladeBereich(token, privat);
  }

  function init() {
    zeigeMeine();

    var oeffnen = document.getElementById('btnTokenOeffnen');
    if (oeffnen) { oeffnen.addEventListener('click', oeffneFeld); }

    var feld = document.getElementById('tokenFeld');
    if (feld) {
      feld.addEventListener('keydown', function (ereignis) {
        if (ereignis.key === 'Enter') { ereignis.preventDefault(); oeffneFeld(); }
      });
    }

    var teile = tokenUndSchluesselAusHash();
    if (teile.token) { ladeBereich(teile.token, teile.privat); }

    window.addEventListener('hashchange', function () {
      var neu = tokenUndSchluesselAusHash();
      if (neu.token && (neu.token !== letzterToken || neu.privat !== letzterSchluessel)) {
        ladeBereich(neu.token, neu.privat);
      }
    });
  }

  init();
})();
