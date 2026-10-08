/* =========================================================
   Digitales Fundbüro — app.js
   Ausbaustufe Task 4: Feed-Liste (Task 3) + Composer mit
   anklickbarer Tastatur, Zeichenzähler, Art-Pills und Validierung.
   Senden folgt in Task 5, Standort in Task 7.

   Abschnitte:
   1. State
   2. Demo-Daten (wird in Task 5 durch Supabase-fetch ersetzt)
   3. Rendering
   4. Events
   5. Init

   Alle Nutzertexte werden per textContent gesetzt — nie rohes
   innerHTML mit Nutzerinhalt. Datum/Nummer kommen aus logic.js.
   ========================================================= */
'use strict';

/* ---------- 1. State ---------- */

// filter: 'alle' | 'verloren' | 'gefunden'
// composer: Eingaben des Formulars; standort füllt Task 7.
const state = { meldungen: [], filter: 'alle', composer: { art: 'verloren', standort: null } };

const FILTER_WERTE = ['alle', 'verloren', 'gefunden'];
const EIN_TAG_MS = 24 * 60 * 60 * 1000; // Fenster für das NEU!-Chip
const TEXT_MAX = 220; // Anzeige-Kürzung im Feed
const EINGABE_MAX = 500; // maxlength am #eingabeText; Zähler zeigt n/500

// Tastatur-Reihen exakt wie im Mockup (brand-jamba-nummer.html):
// 9er-Grid mit A–Z, 0–9, Umlauten und Satzzeichen, darunter die
// breite LEERTASTE. Kappen groß, eingefügt wird klein (kein Shift).
const TASTEN_REIHEN = [
  ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'],
  ['J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'],
  ['S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '1'],
  ['2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Ä', 'Ö', 'Ü', 'ß', '.', ',', '?', '!', '⌫']
];
const TASTE_LEER = 'LEERTASTE';
const TASTE_LOESCHEN = '⌫';
const UMLAUTE = ['Ä', 'Ö', 'Ü', 'ß'];
const SATZZEICHEN = ['.', ',', '?', '!'];

/* ---------- 2. Demo-Daten ---------- */

// ISO-Zeitstempel "vor x Stunden" — so ist nur Mia jünger als 24 h.
function vorStunden(stunden) {
  return new Date(Date.now() - stunden * 60 * 60 * 1000).toISOString();
}

// Dieselben 4 Meldungen wie im Mockup / docs/supabase-setup.sql.
// Feldnamen = spätere DB-Spalten (id, created_at, art, text, name,
// kontakt, lat, lng, radius_m). Zeitstempel relativ zu "jetzt":
// Mia 3 h (NEU!), Jonas 26 h (~1 Tag), Fundbüro 50 h (~2 Tage),
// Anonym 74 h (~3 Tage).
const DEMO_MELDUNGEN = [
  {
    id: 42,
    created_at: vorStunden(3),
    art: 'verloren',
    text: 'Glücks-Fuchsschwanz, zuletzt beim Skatepark gesehen. Pink, mit goldenem Ring.',
    name: 'Mia',
    kontakt: 'mia@web.de',
    lat: 48.1393,
    lng: 11.5765,
    radius_m: null
  },
  {
    id: 41,
    created_at: vorStunden(26),
    art: 'gefunden',
    text: 'Silberner Discman, liegengeblieben in Bus 123, Sitzreihe hinten.',
    name: 'Jonas',
    kontakt: 'jonas@web.de',
    lat: 48.1355,
    lng: 11.5820,
    radius_m: 300
  },
  {
    id: 40,
    created_at: vorStunden(50),
    art: 'gefunden',
    text: 'Ein Handschuh (links), in der Turnhalle abgegeben.',
    name: 'Fundbüro',
    kontakt: null,
    lat: 48.1366,
    lng: 11.5697,
    radius_m: null
  },
  {
    id: 39,
    created_at: vorStunden(74),
    art: 'verloren',
    text: 'Schwarze Mütze, U-Bahn',
    name: null,
    kontakt: null,
    lat: 48.1402,
    lng: 11.5810,
    radius_m: null
  }
];

/* ---------- 3. Rendering ---------- */

// Kürzt lange Texte auf 220 Zeichen und hängt "…" an.
function kuerzeText(text) {
  const sauber = String(text == null ? '' : text);
  return sauber.length > TEXT_MAX ? sauber.slice(0, TEXT_MAX) + '…' : sauber;
}

// NEU! = jünger als 24 h. Ungültiges Datum → false; leicht
// "Zukunft" (kleine Clock-Differenz) zählt bewusst als neu.
function istNeu(createdAt) {
  const alterMs = Date.now() - new Date(createdAt).getTime();
  return alterMs < EIN_TAG_MS;
}

// Filtert nach state.filter und sortiert neueste zuerst (id desc,
// wie später der DB-Abruf mit order=id.desc).
function sortierteMeldungen() {
  const gefiltert = state.filter === 'alle'
    ? state.meldungen
    : state.meldungen.filter(function (meldung) { return meldung.art === state.filter; });
  return gefiltert.slice().sort(function (a, b) { return Number(b.id) - Number(a.id); });
}

// Zähler an den Pills ("Alle (4) · Verloren (2) · Gefunden (2)")
// und Markierung des aktiven Filters.
function aktualisierePills() {
  const anzahl = { alle: state.meldungen.length, verloren: 0, gefunden: 0 };
  state.meldungen.forEach(function (meldung) {
    if (meldung.art === 'verloren') { anzahl.verloren += 1; }
    else if (meldung.art === 'gefunden') { anzahl.gefunden += 1; }
  });

  const beschriftung = { alle: 'Alle', verloren: 'Verloren', gefunden: 'Gefunden' };
  document.querySelectorAll('#filterBar .pill[data-filter]').forEach(function (pill) {
    const wert = pill.dataset.filter;
    pill.textContent = beschriftung[wert] + ' (' + anzahl[wert] + ')';
    const aktiv = wert === state.filter;
    pill.classList.toggle('pillAktiv', aktiv);
    pill.setAttribute('aria-pressed', aktiv ? 'true' : 'false');
  });
}

// Klont das Template und füllt es mit einer Meldung.
function baueKarte(meldung, vorlage) {
  const karte = vorlage.content.firstElementChild.cloneNode(true);

  const badge = karte.querySelector('.badge');
  badge.classList.add(meldung.art);
  badge.textContent = meldung.art === 'gefunden' ? 'GEFUNDEN' : 'VERLOREN';

  const name = String(meldung.name == null ? '' : meldung.name).trim();

  karte.querySelector('.meldungText').textContent = kuerzeText(meldung.text);
  karte.querySelector('.meldungNr').textContent =
    'Nr. ' + FundbueroLogik.formatNummer(meldung.id, meldung.created_at);
  karte.querySelector('.meldungVon').textContent = 'von ' + (name || 'Anonym');
  karte.querySelector('.meldungDatum').textContent = FundbueroLogik.formatDatum(meldung.created_at);

  if (istNeu(meldung.created_at)) {
    karte.querySelector('.neuChip').hidden = false;
  }

  return karte;
}

// Rendert die (gefilterte) Liste, zeigt/versteckt #feedLeer und
// aktualisiert die Pill-Zähler.
function renderFeed() {
  const liste = document.getElementById('feedListe');
  const leer = document.getElementById('feedLeer');
  const vorlage = document.getElementById('tplMeldung');
  if (!liste || !leer || !vorlage) { return; }

  while (liste.firstChild) { liste.removeChild(liste.firstChild); }

  const sichtbar = sortierteMeldungen();
  sichtbar.forEach(function (meldung) {
    liste.appendChild(baueKarte(meldung, vorlage));
  });

  leer.hidden = sichtbar.length !== 0;
  aktualisierePills();
}

// Eine Tastatur-Taste als echter <button type="button"> mit
// Mockup-Farbklasse (Umlaute gelb, Satzzeichen grau, ⌫ rot).
function erzeugeTaste(kappe) {
  const taste = document.createElement('button');
  taste.type = 'button';
  taste.dataset.taste = kappe;
  taste.textContent = kappe;

  if (kappe === TASTE_LEER) {
    taste.classList.add('tasteLeer');
    taste.setAttribute('aria-label', 'Leertaste');
  } else if (kappe === TASTE_LOESCHEN) {
    taste.classList.add('tasteLoesch');
    taste.setAttribute('aria-label', 'Löschen');
  } else if (UMLAUTE.indexOf(kappe) !== -1) {
    taste.classList.add('tasteUmlaut');
  } else if (SATZZEICHEN.indexOf(kappe) !== -1) {
    taste.classList.add('tasteSatz');
  }
  return taste;
}

// Baut die Bildschirmtastatur einmalig in den leeren #tastatur-
// Container (breite LEERTASTE kommt übers CSS, grid-column span 9).
function baueTastatur() {
  const behaelter = document.getElementById('tastatur');
  if (!behaelter) { return; }
  while (behaelter.firstChild) { behaelter.removeChild(behaelter.firstChild); }
  TASTEN_REIHEN.forEach(function (reihe) {
    reihe.forEach(function (kappe) { behaelter.appendChild(erzeugeTaste(kappe)); });
  });
  behaelter.appendChild(erzeugeTaste(TASTE_LEER));
}

// Zeichenzähler live: "n/500" — auch nach physischem Tippen/Einfügen.
function aktualisiereZaehler() {
  const feld = document.getElementById('eingabeText');
  const zaehler = document.getElementById('zeichenZaehler');
  if (!feld || !zaehler) { return; }
  zaehler.textContent = feld.value.length + '/' + EINGABE_MAX;
}

/* ---------- 4. Events ---------- */

function setFilter(filter) {
  if (FILTER_WERTE.indexOf(filter) === -1) { return; }
  state.filter = filter;
  renderFeed(); // Task 6 lässt hier zusätzlich die Karte filtern.
}

// --- Composer: Tastatur, Art-Pills, Validierung ---

// Art-Pills: Optik kommt übers CSS (aria-pressed), hier nur State + A11y.
function setArt(art) {
  if (art !== 'verloren' && art !== 'gefunden') { return; }
  state.composer.art = art;
  document.querySelectorAll('#composer .artPill[data-art]').forEach(function (pill) {
    pill.setAttribute('aria-pressed', pill.dataset.art === art ? 'true' : 'false');
  });
}

// Aktuelle Cursor-/Selektionsposition (Fallback: Textende).
function auswahlBereich(feld) {
  if (feld.selectionStart == null || feld.selectionEnd == null) {
    const laenge = feld.value.length;
    return { start: laenge, ende: laenge };
  }
  return { start: feld.selectionStart, ende: feld.selectionEnd };
}

// Cursor auf pos setzen, Fokus zurück ins Textfeld, Zähler aktualisieren.
function setzeCursor(feld, pos) {
  feld.focus();
  const laenge = feld.value.length;
  const ziel = Math.max(0, Math.min(Number(pos) || 0, laenge));
  if (typeof feld.setSelectionRange === 'function') { feld.setSelectionRange(ziel, ziel); }
  aktualisiereZaehler();
}

// Tastatur-Einfügen an der Cursorposition bzw. Ersetzen der Auswahl.
// Exakt über FundbueroLogik.insertFuerText; am 500er-Limit wie
// maxlength: nichts einfügen (Auswahl ersetzen bleibt möglich).
function fuegeZeichenEin(zeichen) {
  const feld = document.getElementById('eingabeText');
  if (!feld) { return; }
  const einzufuegen = String(zeichen == null ? '' : zeichen);
  if (einzufuegen === '') { return; }
  const bereich = auswahlBereich(feld);
  if (feld.value.length - (bereich.ende - bereich.start) >= EINGABE_MAX) {
    feld.focus(); // Limit erreicht: nichts einfügen, aber Bedienung/Zähler pflegen
    aktualisiereZaehler();
    return;
  }
  const ergebnis = FundbueroLogik.insertFuerText(feld.value, bereich.start, bereich.ende, einzufuegen);
  feld.value = ergebnis.text;
  setzeCursor(feld, ergebnis.pos);
}

// ⌫: Auswahl löschen bzw. ein Zeichen davor — über loescheZurueck.
function loescheZeichen() {
  const feld = document.getElementById('eingabeText');
  if (!feld) { return; }
  const bereich = auswahlBereich(feld);
  const ergebnis = FundbueroLogik.loescheZurueck(feld.value, bereich.start, bereich.ende);
  feld.value = ergebnis.text;
  setzeCursor(feld, ergebnis.pos);
}

// Klick auf eine Taste: preventDefault, klein einfügen (bzw. ⌫/Leer).
function behandleTastaturKlick(ereignis) {
  const taste = ereignis.target && ereignis.target.closest
    ? ereignis.target.closest('#tastatur button[data-taste]')
    : null;
  if (!taste) { return; }
  ereignis.preventDefault();
  const kappe = taste.dataset.taste;
  if (kappe === TASTE_LOESCHEN) { loescheZeichen(); }
  else { fuegeZeichenEin(kappe === TASTE_LEER ? ' ' : kappe.toLowerCase()); }
}

// Statuszeile: Fehlertexte rot, leer/neutral nach Erfolg (CSS: .ok grün).
function zeigeFormStatus(nachricht, ok) {
  const status = document.getElementById('formStatus');
  if (!status) { return; }
  status.textContent = nachricht;
  status.classList.toggle('ok', !!ok);
}

// Task 4: nur validieren und Fehler zeigen — noch kein Senden.
function verarbeiteAbsenden() {
  const feldText = document.getElementById('eingabeText');
  const feldName = document.getElementById('eingabeName');
  const feldKontakt = document.getElementById('eingabeKontakt');

  const ergebnis = FundbueroLogik.validiereMeldung({
    art: state.composer.art,
    text: feldText ? feldText.value : '',
    name: feldName ? feldName.value : '',
    kontakt: feldKontakt ? feldKontakt.value : ''
  });

  if (!ergebnis.ok) {
    zeigeFormStatus(ergebnis.fehler.join(' '), false);
    if (feldText) { feldText.focus(); }
    return;
  }

  zeigeFormStatus('', false); // alte Fehler wegräumen, keine Erfolgsmeldung in Task 4
  // Task 5: hier an Supabase senden (ergebnis.daten + state.composer.standort aus Task 7).
}

// Verdrahtet Tastatur, Zähler, Art-Pills und den Submit-Pfad.
function verdrahteComposer() {
  const formular = document.getElementById('composer');
  if (!formular) { return; }

  const artPills = formular.querySelector('.artPills');
  if (artPills) {
    artPills.addEventListener('click', function (ereignis) {
      const pill = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest('.artPill[data-art]')
        : null;
      if (pill) { setArt(pill.dataset.art); }
    });
  }

  const tastatur = document.getElementById('tastatur');
  if (tastatur) {
    tastatur.addEventListener('click', behandleTastaturKlick);
  }

  // Physische Tastatur bleibt normal nutzbar — nur Zähler mitziehen.
  const feldText = document.getElementById('eingabeText');
  if (feldText) {
    feldText.addEventListener('input', aktualisiereZaehler);
  }

  // type="submit" + novalidate: Reload verhindern, selbst validieren.
  formular.addEventListener('submit', function (ereignis) {
    ereignis.preventDefault();
    verarbeiteAbsenden();
  });
}

function verdrahteEvents() {
  const filterBar = document.getElementById('filterBar');
  if (filterBar) {
    filterBar.addEventListener('click', function (ereignis) {
      const ziel = ereignis.target;
      const pill = ziel && ziel.closest ? ziel.closest('.pill[data-filter]') : null;
      if (pill) { setFilter(pill.dataset.filter); }
    });
  }

  const aktualisieren = document.getElementById('aktualisieren');
  if (aktualisieren) {
    aktualisieren.addEventListener('click', function () {
      renderFeed(); // Vorerst nur neu rendern; Task 5 lädt hier neu vom Amt.
    });
  }

  verdrahteComposer();
}

/* ---------- 5. Init ---------- */

function init() {
  state.meldungen = DEMO_MELDUNGEN.slice();
  baueTastatur();
  verdrahteEvents();
  renderFeed();
  setArt(state.composer.art);
  aktualisiereZaehler();
}

init();
