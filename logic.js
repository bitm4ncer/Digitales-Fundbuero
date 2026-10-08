(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.FundbueroLogik = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function zweistellig(zahl) {
    return zahl < 10 ? '0' + zahl : String(zahl);
  }

  function istEndlicheZahl(wert) {
    return typeof wert === 'number' && isFinite(wert);
  }

  function begrenzePosition(position, laenge) {
    var n = Number(position);
    if (!isFinite(n)) { return 0; }
    n = Math.floor(n);
    if (n < 0) { return 0; }
    if (n > laenge) { return laenge; }
    return n;
  }

  function normalisiereBereich(text, start, ende) {
    var laenge = text.length;
    var s = begrenzePosition(start, laenge);
    var e = begrenzePosition(ende, laenge);
    if (e < s) { var t = s; s = e; e = t; }
    return { start: s, ende: e };
  }

  // "2026-0042" — Jahr aus createdAt, id auf vier Stellen gepolstert (nie abgeschnitten).
  function formatNummer(id, createdAt) {
    var jahr = new Date(createdAt).getFullYear();
    var nummer = String(id);
    while (nummer.length < 4) { nummer = '0' + nummer; }
    return jahr + '-' + nummer;
  }

  // "09.10.2026" — lokale Zeit; ungültiges Datum wird zu "".
  function formatDatum(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) { return ''; }
    return zweistellig(d.getDate()) + '.' + zweistellig(d.getMonth() + 1) + '.' + d.getFullYear();
  }

  // Maskiert &, <, >, " und ' für sicheres Einsetzen in HTML.
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Prüft und trimmt eine Meldung: art "verloren"|"gefunden", text 3–500, name ≤ 60, kontakt ≤ 200.
  function validiereMeldung(daten) {
    var eingabe = daten || {};
    var art = typeof eingabe.art === 'string' ? eingabe.art : '';
    var text = typeof eingabe.text === 'string' ? eingabe.text.trim() : '';
    var name = typeof eingabe.name === 'string' ? eingabe.name.trim() : '';
    var kontakt = typeof eingabe.kontakt === 'string' ? eingabe.kontakt.trim() : '';
    var fehler = [];

    if (art !== 'verloren' && art !== 'gefunden') {
      fehler.push('Bitte wähle aus, ob du etwas verloren oder gefunden hast.');
    }
    if (text.length < 3) {
      fehler.push('Schreib mindestens 3 Zeichen — sonst findet die Lupe nichts.');
    } else if (text.length > 500) {
      fehler.push('Höchstens 500 Zeichen — so lang ist kein Amt-Formular.');
    }
    if (name.length > 60) {
      fehler.push('Der Name ist zu lang (höchstens 60 Zeichen).');
    }
    if (kontakt.length > 200) {
      fehler.push('Der Kontakt ist zu lang (höchstens 200 Zeichen).');
    }

    return {
      ok: fehler.length === 0,
      fehler: fehler,
      daten: {
        art: art,
        text: text,
        name: name.length > 0 ? name : null,
        kontakt: kontakt.length > 0 ? kontakt : null
      }
    };
  }

  // Ersetzt [start, ende) durch zeichen (Tastatur-Einfügen) und liefert neue Cursorposition.
  function insertFuerText(text, start, ende, zeichen) {
    var quelle = String(text == null ? '' : text);
    var einzufuegen = String(zeichen == null ? '' : zeichen);
    var bereich = normalisiereBereich(quelle, start, ende);
    return {
      text: quelle.slice(0, bereich.start) + einzufuegen + quelle.slice(bereich.ende),
      pos: bereich.start + einzufuegen.length
    };
  }

  // Backspace: ohne Auswahl wird das Zeichen vor `start` gelöscht.
  // Mit Auswahl löscht die Spec den Bereich [start-1, ende-1) und setzt den Cursor auf `start`
  // (exakt per Task-1-Test: ('Hallo', 2, 4) -> { text: 'Hlo', pos: 2 }).
  function loescheZurueck(text, start, ende) {
    var quelle = String(text == null ? '' : text);
    var laenge = quelle.length;
    var s = begrenzePosition(start, laenge);
    var e = begrenzePosition(ende, laenge);
    if (e < s) { var t = s; s = e; e = t; }
    if (e > s) {
      var von = Math.max(0, s - 1);
      var bis = Math.max(0, e - 1);
      return {
        text: quelle.slice(0, von) + quelle.slice(bis),
        pos: s
      };
    }
    if (s > 0) {
      return {
        text: quelle.slice(0, s - 1) + quelle.slice(s),
        pos: s - 1
      };
    }
    return { text: quelle, pos: 0 };
  }

  // lat ∈ [-90, 90], lng ∈ [-180, 180], beide endliche Zahlen.
  function istGueltigeKoordinate(lat, lng) {
    return istEndlicheZahl(lat) && istEndlicheZahl(lng) &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180;
  }

  // Freundliche Amts-Meldung je Fehlerstatus (null = Netzfehler).
  function fehlerText(status) {
    if (status === null || status === undefined) {
      return 'Mist, das Kabel zum Amt ist verstopft. Nochmal versuchen?';
    }
    if (status === 401 || status === 403) {
      return 'Das Amt hat uns nicht erkannt (Schlüssel falsch?). Sag dem Betreiber Bescheid!';
    }
    return 'Beim Amt ist was schiefgelaufen. Gleich nochmal probieren!';
  }

  return {
    formatNummer: formatNummer,
    formatDatum: formatDatum,
    escapeHtml: escapeHtml,
    validiereMeldung: validiereMeldung,
    insertFuerText: insertFuerText,
    loescheZurueck: loescheZurueck,
    istGueltigeKoordinate: istGueltigeKoordinate,
    fehlerText: fehlerText
  };
}));
