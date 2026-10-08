/* =========================================================
   Digitales Fundbüro — app.js
   Ausbaustufe Task 3: Feed-Liste mit Demo-Daten, Filtern und
   Zählern.

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
const state = { meldungen: [], filter: 'alle' };

const FILTER_WERTE = ['alle', 'verloren', 'gefunden'];
const EIN_TAG_MS = 24 * 60 * 60 * 1000; // Fenster für das NEU!-Chip
const TEXT_MAX = 220; // Anzeige-Kürzung im Feed

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

/* ---------- 4. Events ---------- */

function setFilter(filter) {
  if (FILTER_WERTE.indexOf(filter) === -1) { return; }
  state.filter = filter;
  renderFeed(); // Task 6 lässt hier zusätzlich die Karte filtern.
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
}

/* ---------- 5. Init ---------- */

function init() {
  state.meldungen = DEMO_MELDUNGEN.slice();
  verdrahteEvents();
  renderFeed();
}

init();
