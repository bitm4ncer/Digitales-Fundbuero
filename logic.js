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

    if (art !== 'verloren' && art !== 'gefunden' && art !== 'verschenken' && art !== 'gesucht') {
      fehler.push('Bitte wähle eine Kategorie: verloren, gefunden, zu verschenken oder gesucht.');
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

  // Backspace: mit Auswahl wird [start, ende) gelöscht, ohne Auswahl das Zeichen vor `start`.
  function loescheZurueck(text, start, ende) {
    var quelle = String(text == null ? '' : text);
    var bereich = normalisiereBereich(quelle, start, ende);
    if (bereich.ende > bereich.start) {
      return {
        text: quelle.slice(0, bereich.start) + quelle.slice(bereich.ende),
        pos: bereich.start
      };
    }
    if (bereich.start > 0) {
      return {
        text: quelle.slice(0, bereich.start - 1) + quelle.slice(bereich.start),
        pos: bereich.start - 1
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

  // Einfache, praxistaugliche E-Mail-Prüfung (Kontaktformular „Antworten").
  // Bewusst kein RFC-Parser — nur „eine @ mit etwas drumherum".
  function istGueltigeEmail(text) {
    if (typeof text !== 'string') { return false; }
    var wert = text.trim();
    if (wert.length < 5 || wert.length > 200) { return false; }
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(wert);
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
    istGueltigeEmail: istGueltigeEmail,
    fehlerText: fehlerText
  };
}));
