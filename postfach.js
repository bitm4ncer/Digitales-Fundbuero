/* Postfach-Seite: liest Antworten über die RPC „nachrichten_lesen" —
   ausschließlich mit dem geheimen Token (aus dem Link #token oder dem
   Browser-Gedächtnis). Rendert alles per textContent (kein HTML-Sink). */

(function () {
  'use strict';

  var POSTFACH_KEY = 'fundbueroPostfaecher';

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

  function leseMeine() {
    try {
      var roh = localStorage.getItem(POSTFACH_KEY);
      var liste = roh ? JSON.parse(roh) : [];
      return Array.isArray(liste) ? liste : [];
    } catch (e) {
      return [];
    }
  }

  function setzeStatus(text, erfolg) {
    var status = document.getElementById('postfachStatus');
    if (!status) { return; }
    status.textContent = text;
    status.classList.toggle('ok', !!erfolg);
  }

  // „Meine Postfächer (auf diesem Gerät)" aus dem Browser-Gedächtnis.
  function zeigeMeine() {
    var box = document.getElementById('postfachMeine');
    if (!box) { return; }
    var meine = leseMeine();
    if (!meine.length) { return; }

    var titel = document.createElement('h2');
    titel.textContent = 'Meine Postfächer (auf diesem Gerät)';
    box.appendChild(titel);

    meine.forEach(function (eintrag) {
      var zeile = document.createElement('div');
      zeile.className = 'postfachItem';

      var meta = document.createElement('div');
      meta.className = 'postfachMeta';
      meta.textContent = eintrag.nr + (eintrag.titel ? (' · „' + eintrag.titel + '…“') : '');

      var knopf = document.createElement('button');
      knopf.type = 'button';
      knopf.className = 'pill';
      knopf.textContent = 'Öffnen';
      knopf.addEventListener('click', function () { ladePostfach(eintrag.token); });

      zeile.appendChild(meta);
      zeile.appendChild(knopf);
      box.appendChild(zeile);
    });
  }

  function ladePostfach(token) {
    var liste = document.getElementById('postfachListe');
    if (!liste) { return; }
    liste.textContent = '';

    if (!konfiguriert()) {
      setzeStatus('Das Amt ist noch nicht angeschlossen … Bald geht\'s los!', false);
      return;
    }
    if (!token) {
      setzeStatus('Kein Postfach-Code — bitte füge deinen Postfach-Link ein.', false);
      return;
    }

    setzeStatus('Postfach wird geöffnet …', false);

    fetch(basis() + '/rest/v1/rpc/nachrichten_lesen', {
      method: 'POST',
      headers: header({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_token: token })
    }).then(function (antwort) {
      if (!antwort.ok) { throw new Error('HTTP ' + antwort.status); }
      return antwort.json();
    }).then(function (daten) {
      var nachrichten = Array.isArray(daten) ? daten : [];
      setzeStatus(
        nachrichten.length
          ? (nachrichten.length + (nachrichten.length === 1 ? ' Nachricht' : ' Nachrichten') + ' — die Lupe hat was gefunden! 🔍')
          : 'Noch keine Antworten — die Lupe hält die Augen offen. 👀',
        nachrichten.length > 0
      );
      nachrichten.forEach(function (nachricht) {
        liste.appendChild(baueNachricht(token, nachricht));
      });
    }).catch(function () {
      setzeStatus('Postfach konnte nicht geladen werden — ist der Link komplett?', false);
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
    loeschen.textContent = '🗑 Löschen';
    loeschen.addEventListener('click', function () { loescheNachricht(token, nachricht.id); });

    karte.appendChild(meta);
    karte.appendChild(text);
    karte.appendChild(loeschen);
    return karte;
  }

  function loescheNachricht(token, id) {
    fetch(basis() + '/rest/v1/rpc/nachricht_loeschen', {
      method: 'POST',
      headers: header({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ p_token: token, p_id: id })
    }).then(function (antwort) {
      if (!antwort.ok) { throw new Error('HTTP ' + antwort.status); }
      return antwort.json();
    }).then(function () {
      ladePostfach(token);
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
    if (token && window.location.hash !== '#' + token) {
      window.location.hash = token;
    }
    ladePostfach(token);
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
    if (token) { ladePostfach(token); }
  }

  init();
})();
