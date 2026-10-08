/* =========================================================
   Digitales Fundbüro — app.js
   Ausbaustufe Task 5: echter geteilter Feed über Supabase
   (laden, posten, Fehlerpfade) — dazu Feed-Liste (Task 3)
   und Composer mit Tastatur/Validierung (Task 4).
   Standort im Formular folgt in Task 7.

   Abschnitte:
   1. State
   2. Supabase (Konfiguration, Laden, Senden)
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

// sendet: Reentrancy-Guard — während eines laufenden POST ist der Absende-Button gesperrt.
let sendet = false;

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

/* ---------- 2. Supabase (Konfiguration, Laden, Senden) ---------- */

// Fenster-Konfiguration aus config.js — fehlt sie ganz, ist das Amt zu.
function konfiguration() {
  return (typeof window !== 'undefined' && window.FUNDBUERO_CONFIG) ? window.FUNDBUERO_CONFIG : {};
}

// Project-URL ohne trailing slash: "https://x.supabase.co/" = "https://x.supabase.co".
function supabaseBasis() {
  const url = konfiguration().supabaseUrl;
  return String(url == null ? '' : url).trim().replace(/\/+$/, '');
}

function supabaseAnon() {
  const key = konfiguration().supabaseAnonKey;
  return String(key == null ? '' : key).trim();
}

// Beide Config-Werte müssen nicht leer sein, sonst bleibt das Amt "nicht angeschlossen".
function istKonfiguriert() {
  return supabaseBasis() !== '' && supabaseAnon() !== '';
}

// Header für alle REST-Aufrufe; zusatz trägt POST-spezifische Felder bei.
function supabaseHeader(zusatz) {
  const kopf = {
    apikey: supabaseAnon(),
    Authorization: 'Bearer ' + supabaseAnon()
  };
  const extraFelder = zusatz || {};
  Object.keys(extraFelder).forEach(function (name) { kopf[name] = extraFelder[name]; });
  return kopf;
}

// HTTP-Fehler tragen den Status; Netz-/Parse-Fehler (z. B. TypeError) nicht.
function httpFehler(status) {
  const fehler = new Error('HTTP ' + status);
  fehler.status = status;
  return fehler;
}

function statusAus(fehler) {
  return fehler && typeof fehler.status === 'number' ? fehler.status : null;
}

// Banner über dem Layout: Unkonfiguriert-Hinweis und Ladefehler.
function zeigeStatusHinweis(nachricht) {
  const hinweis = document.getElementById('statusHinweis');
  if (!hinweis) { return; }
  hinweis.textContent = nachricht;
  hinweis.hidden = false;
}

function versteckeStatusHinweis() {
  const hinweis = document.getElementById('statusHinweis');
  if (!hinweis) { return; }
  hinweis.hidden = true;
}

// Task 5: GET der neuesten 200 Meldungen. Unkonfiguriert → Hinweis statt
// Karten; Fehler landen in #statusHinweis (kein Absturz, kein leerer Screen).
function ladeMeldungen() {
  if (!istKonfiguriert()) {
    state.meldungen = [];
    renderFeed();
    zeigeStatusHinweis('Das Amt ist noch nicht angeschlossen … Bald geht\'s los!');
    return Promise.resolve();
  }

  return fetch(supabaseBasis() + '/rest/v1/meldungen?select=*&order=id.desc&limit=200', {
    headers: supabaseHeader()
  }).then(function (antwort) {
    if (!antwort.ok) { throw httpFehler(antwort.status); }
    return antwort.json();
  }).then(function (daten) {
    state.meldungen = Array.isArray(daten) ? daten : [];
    versteckeStatusHinweis();
    renderFeed();
  }).catch(function (fehler) {
    zeigeStatusHinweis(FundbueroLogik.fehlerText(statusAus(fehler)));
  });
}

// Task 5: POST einer validierten Meldung. Body exakt art, text, name,
// kontakt, lat, lng, radius_m — leere Optionals und fehlender Standort
// (Task 7) sind null. Prefer: return=minimal, Antwort hat keinen Body.
function postMeldung(daten) {
  const standort = state.composer.standort;
  const koerper = {
    art: daten.art,
    text: daten.text,
    name: daten.name,
    kontakt: daten.kontakt,
    lat: standort ? standort.lat : null,
    lng: standort ? standort.lng : null,
    radius_m: standort ? standort.radius_m : null
  };

  return fetch(supabaseBasis() + '/rest/v1/meldungen', {
    method: 'POST',
    headers: supabaseHeader({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
    body: JSON.stringify(koerper)
  }).then(function (antwort) {
    if (!antwort.ok) { throw httpFehler(antwort.status); }
    return null;
  });
}

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

// Task 5: Button während eines laufenden POST sperren (Doppelklick-Guard).
function setzeSendeZustand(aktiv) {
  sendet = aktiv;
  const button = document.getElementById('btnAbsenden');
  if (button) { button.disabled = aktiv; }
}

// Erfolg: Felder leeren, Art zurück auf VERLOREN, Zähler 0/500.
// (Standort und Mini-Karte setzt Task 7 nach dem Posten zurück.)
function leereFormular() {
  const feldText = document.getElementById('eingabeText');
  const feldName = document.getElementById('eingabeName');
  const feldKontakt = document.getElementById('eingabeKontakt');
  if (feldText) { feldText.value = ''; }
  if (feldName) { feldName.value = ''; }
  if (feldKontakt) { feldKontakt.value = ''; }
  setArt('verloren');
  aktualisiereZaehler();
}

// Task 5: POST + Erfolgs-/Fehlerfluss. Erfolg räumt das Formular,
// zeigt die Erfolgszeile und lädt frisch vom Amt (neue Nr. sofort oben).
function sendeMeldung(daten) {
  setzeSendeZustand(true);
  postMeldung(daten)
    .then(function () {
      leereFormular();
      zeigeFormStatus('Eingetragen! Die Lupe macht sich auf die Suche. 🔍', true);
      return ladeMeldungen();
    })
    .catch(function (fehler) {
      zeigeFormStatus(FundbueroLogik.fehlerText(statusAus(fehler)), false);
    })
    .then(function () {
      setzeSendeZustand(false);
    });
}

// Task 4/5: validieren, Fehler zeigen — sonst an Supabase senden.
function verarbeiteAbsenden() {
  if (sendet) { return; } // Es läuft bereits ein Request — nichts doppelt senden.

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

  zeigeFormStatus('', false); // alte Fehler wegräumen
  if (!istKonfiguriert()) {
    zeigeFormStatus('Das Amt ist noch nicht angeschlossen … Bald geht\'s los!', false);
    return;
  }
  sendeMeldung(ergebnis.daten); // { art, text, name, kontakt } + Standort (Task 7)
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
      ladeMeldungen(); // Task 5: frisch vom Amt laden (Fehler → #statusHinweis)
    });
  }

  verdrahteComposer();
}

/* ---------- 5. Init ---------- */

function init() {
  baueTastatur();
  verdrahteEvents();
  setArt(state.composer.art);
  aktualisiereZaehler();
  ladeMeldungen(); // Task 5: echte Einträge aus Supabase oder Nicht-angeschlossen-Hinweis
}

init();
