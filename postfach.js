/* „Mein Bereich": Beitrag anzeigen + löschen und Postfach lesen —
   ausschließlich mit dem geheimen Token (aus dem Link #token oder dem
   Browser-Gedächtnis). Alles wird per textContent gerendert (kein HTML-Sink). */

(function () {
  'use strict';

  var POSTFACH_KEY = 'fundbueroPostfaecher';
  var letzterToken = '';

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

  // „Meine Beiträge (auf diesem Gerät)" aus dem Browser-Gedächtnis.
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
      meta.textContent = eintrag.nr + ' · ' + modusText + (eintrag.titel ? (' · „' + eintrag.titel + '…“') : '');

      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'pill';
      knopf.textContent = 'Öffnen';
      knopf.addEventListener('click', function () { oeffne(eintrag.token); });

      zeile.appendChild(meta);
      zeile.appendChild(knopf);
      box.appendChild(zeile);
    });
  }

  function oeffne(token) {
    if (token && window.location.hash !== '#' + token) {
      window.location.hash = token;
    }
    ladeBereich(token);
  }

  function ladeBereich(token) {
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
    setzeStatus('Wird geöffnet …', false);

    rpc('beitrag_info', { p_token: token }).then(function (daten) {
      var beitrag = Array.isArray(daten) ? daten[0] : null;
      if (!beitrag) {
        setzeStatus('Dazu finde ich nichts — ist der Link komplett?', false);
        return;
      }

      kopfBox.appendChild(baueBeitragKopf(token, beitrag));

      var nummer = 'Nr. ' + FundbueroLogik.formatNummer(beitrag.id, beitrag.created_at);
      if (beitrag.kontakt_modus === 'postfach') {
        return leseNachrichten(token).then(function (nachrichten) {
          setzeStatus(
            nachrichten.length
              ? (nummer + ': ' + nachrichten.length + (nachrichten.length === 1 ? ' Nachricht' : ' Nachrichten') + ' — die Lupe hat was gefunden!')
              : (nummer + ': Noch keine Antworten — die Lupe hält die Augen offen.'),
            nachrichten.length > 0
          );
          nachrichten.forEach(function (nachricht) {
            liste.appendChild(baueNachricht(token, nachricht));
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

  // Kopfteil: welcher Beitrag ist das + „Beitrag löschen"-Knopf.
  function baueBeitragKopf(token, beitrag) {
    var box = document.createElement('div');
    box.className = 'beitragKopf';

    var nr = document.createElement('b');
    nr.textContent = 'Nr. ' + FundbueroLogik.formatNummer(beitrag.id, beitrag.created_at) + ' · ';

    var text = document.createElement('span');
    var inhalt = String(beitrag.text == null ? '' : beitrag.text);
    text.textContent = inhalt.length > 90 ? (inhalt.slice(0, 90) + '…') : inhalt;

    var loeschen = document.createElement('button');
    loeschen.type = 'button';
    loeschen.className = 'pill pillGefahr';
    if (typeof FundbueroIcons !== 'undefined') { loeschen.appendChild(FundbueroIcons.baue('muell', 14)); }
    loeschen.appendChild(document.createTextNode(' Beitrag löschen'));
    loeschen.addEventListener('click', function () { loescheBeitrag(token, beitrag.id); });

    box.appendChild(nr);
    box.appendChild(text);
    box.appendChild(document.createElement('br'));
    box.appendChild(loeschen);
    return box;
  }

  function loescheBeitrag(token, id) {
    if (!window.confirm('Beitrag wirklich löschen? Auch alle Antworten im Postfach verschwinden damit.')) {
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

  function baueNachricht(token, nachricht) {
    var karte = document.createElement('div');
    karte.className = 'postfachItem';

    var meta = document.createElement('div');
    meta.className = 'postfachMeta';
    var name = String(nachricht.absender_name == null ? '' : nachricht.absender_name).trim();
    var email = String(nachricht.absender_email == null ? '' : nachricht.absender_email).trim();
    meta.appendChild(document.createTextNode(
      (name || 'Anonym') + ' · ' + FundbueroLogik.formatDatum(nachricht.created_at) + ' · '
    ));
    if (email) {
      var link = document.createElement('a');
      link.href = 'mailto:' + email;
      link.textContent = email;
      meta.appendChild(link);
    }

    var text = document.createElement('div');
    text.className = 'postfachText';
    text.textContent = String(nachricht.nachricht == null ? '' : nachricht.nachricht);

    var loeschen = document.createElement('button');
    loeschen.type = 'button';
    loeschen.className = 'pill';
    if (typeof FundbueroIcons !== 'undefined') { loeschen.appendChild(FundbueroIcons.baue('muell', 14)); }
    loeschen.appendChild(document.createTextNode(' Löschen'));
    loeschen.addEventListener('click', function () { loescheNachricht(token, nachricht.id); });

    karte.appendChild(meta);
    karte.appendChild(text);
    karte.appendChild(loeschen);
    return karte;
  }

  function loescheNachricht(token, id) {
    rpc('nachricht_loeschen', { p_token: token, p_id: id }).then(function () {
      ladeBereich(token);
    }).catch(function () {
      setzeStatus('Löschen ging nicht — nochmal probieren.', false);
    });
  }

  function tokenAusHash() {
    var hash = String(window.location.hash || '');
    return hash.length > 1 ? hash.slice(1) : '';
  }

  function oeffneFeld() {
    var feld = document.getElementById('tokenFeld');
    var eingabe = feld ? feld.value.trim() : '';
    // Erlaubt auch das Einfügen des kompletten Links (…#token).
    var treffer = eingabe.match(/#([0-9a-fA-F-]{36})$/);
    var token = treffer ? treffer[1] : eingabe;
    oeffne(token);
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

    var token = tokenAusHash();
    if (token) { ladeBereich(token); }

    // Hash-Wechsel (z. B. aus der Liste heraus) soll nachladen.
    window.addEventListener('hashchange', function () {
      var neu = tokenAusHash();
      if (neu && neu !== letzterToken) { ladeBereich(neu); }
    });
  }

  init();
})();
