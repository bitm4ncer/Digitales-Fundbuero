/* =========================================================
   Digitales Fundbüro — app.js
   Ausbaustufe Task 8: Karten-Leerzustand (#mapLeer) — aufbauend
   auf Task 7 (Standort im Formular), Task 6 (Karten-Sidebar),
   Task 5 (echter geteilter Feed), Task 4 (Composer mit Tastatur/
   Validierung) und Task 3 (Feed-Liste).

   Abschnitte:
   1. State
   2. Supabase (Konfiguration, Laden, Senden)
   3. Rendering (Feed, Tastatur, Karte)
   4. Events
   5. Init

   Nutzertexte laufen per textContent ins DOM; einziges HTML-Sink
   ist das Leaflet-Popup (bindPopup) — dort schützt konsequent
   FundbueroLogik.escapeHtml. Datum/Nummer kommen aus logic.js.
   ========================================================= */
'use strict';

/* ---------- 1. State ---------- */

// filter: 'alle' | 'verloren' | 'gefunden' | 'verschenken'
// composer: Eingaben des Formulars. standort (Task 7) ist null (kein
// Standort) oder { lat, lng, radius_m }; radius_m null = genauer Punkt.
const state = { meldungen: [], filter: 'alle', composer: { art: 'verloren', standort: null, kontaktModus: '' } };

// sendet: Reentrancy-Guard — während eines laufenden POST ist der Absende-Button gesperrt.
// karte/pinEbene/kreisEbene: Leaflet-Instanz der Sidebar (Task 6); pinAnzahl speist
// Pin-Zähler und Mobil-Button. Alles bleibt null, wenn Leaflet (CDN) fehlt.
let sendet = false;
let karte = null;
let pinEbene = null;
let kreisEbene = null;
let pinAnzahl = 0;
// Task 7: Mini-Karte im Formular + aktueller Modus ('bereich' | 'punkt').
let karteMini = null;
let markerMini = null;
let kreisMini = null;
let standortModus = 'bereich';

const FILTER_WERTE = ['alle', 'verloren', 'gefunden', 'verschenken'];
const EIN_TAG_MS = 24 * 60 * 60 * 1000; // Fenster für das NEU!-Chip
const TEXT_MAX = 220; // Anzeige-Kürzung im Feed
const EINGABE_MAX = 500; // maxlength am #eingabeText; Zähler zeigt n/500
const POPUP_TEXT_MAX = 120; // Anzeige-Kürzung im Karten-Popup
const HERVOR_MS = 2000; // So lange leuchtet die Feed-Karte nach „Zur Meldung ↓"
const FETCH_TIMEOUT_MS = 10000; // Hängt das Amt (GET/POST), bricht der Abort-Timer den Request ab

// Karten-Grunddaten laut Spec/Mockup (sidebar.html).
const KARTE_MITTE = [51.163, 10.447]; // Deutschland-Mitte
const KARTE_ZOOM = 6;
const KARTE_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const KARTE_ATTRIBUTION = '© OpenStreetMap-Mitwirkende';
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'; // Ortssuche (OpenStreetMap), kein Key nötig
const MOBIL_QUERY = '(max-width: 860px)'; // synchron zu style.css
const RADIUS_START = 300; // Standort-Regler (Task 7): 50–1000 m, Start 300

// Pin-Farben/-Buchstaben exakt wie im Mockup (hell → dunkel).
const PIN_FARBEN = {
  verloren: { hell: '#ff8a80', dunkel: '#e0342a', buchstabe: 'V' },
  gefunden: { hell: '#7ee08a', dunkel: '#1fa53c', buchstabe: 'G' },
  verschenken: { hell: '#ffb85e', dunkel: '#e07a00', buchstabe: 'S' },
  gesucht: { hell: '#c9a2ff', dunkel: '#7a3fd1', buchstabe: '?' }
};

// Badge-Texte und Composer-Überschrift je Kategorie (die Überschrift passt
// sich der gewählten Kategorie an: verloren / gefunden / verschenken / gesucht).
const ART_LABEL = { verloren: 'VERLOREN', gefunden: 'GEFUNDEN', verschenken: 'VERSCHENKEN', gesucht: 'GESUCHT' };
const TITEL_TEXT = {
  verloren: 'Was hast DU verloren?',
  gefunden: 'Was hast DU gefunden?',
  verschenken: 'Was willst DU verschenken?',
  gesucht: 'Was suchst DU?'
};

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
  // Vom Timeout abgebrochene Requests zählen wie Netzfehler (kein HTTP-Status).
  if (fehler && fehler.name === 'AbortError') { return null; }
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

// Spalten fürs Laden. kontakt/kontakt_modus stammen aus dem Kontakt-Setup
// (docs/supabase-setup.sql, Schritt 4): fehlen sie noch, fällt die App
// einmalig auf die Basisspalten zurück — Kontaktzeile/Knopf bleiben dann aus.
const FELDER_BASIS = 'id,created_at,art,text,name,lat,lng,radius_m';
const FELDER_KONTAKT = FELDER_BASIS + ',kontakt,kontakt_modus';

function holeMeldungen(felder) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

  return fetch(supabaseBasis() + '/rest/v1/meldungen?select=' + felder + '&order=id.desc&limit=200', {
    headers: supabaseHeader(),
    signal: controller.signal
  }).then(function (antwort) {
    if (!antwort.ok) { throw httpFehler(antwort.status); }
    return antwort.json();
  }).finally(function () {
    clearTimeout(timer); // Timer auch bei Erfolg/HTTP-Fehler aufräumen
  });
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

  return holeMeldungen(FELDER_KONTAKT).catch(function (fehler) {
    // Kontakt-Spalten fehlen noch (z. B. vor dem Setup-SQL):
    // einmalig ohne sie erneut laden — der Rest bleibt ganz normal.
    if (fehler && fehler.status === 400) {
      return holeMeldungen(FELDER_BASIS);
    }
    throw fehler;
  }).then(function (daten) {
    state.meldungen = Array.isArray(daten) ? daten : [];
    versteckeStatusHinweis();
    renderFeed();
  }).catch(function (fehler) {
    // HTTP-Fehler wie bisher; AbortError/Netzfehler → statusAus null → fehlerText(null).
    zeigeStatusHinweis(FundbueroLogik.fehlerText(statusAus(fehler)));
  });
}

// Task 5: POST einer validierten Meldung. Body: art, text, name, kontakt,
// kontakt_modus, postfach_token, lat, lng, radius_m — leere Optionals und
// fehlender Standort (Task 7) sind null. return=representation + select=id,
// damit wir die neue Nr. fürs Postfach (und die Erfolgsanzeige) kennen.
function postMeldung(daten) {
  const standort = state.composer.standort;
  const koerper = {
    art: daten.art,
    text: daten.text,
    name: daten.name,
    kontakt: daten.kontakt,
    kontakt_modus: daten.kontakt_modus,
    postfach_token: daten.postfach_token,
    lat: standort ? standort.lat : null,
    lng: standort ? standort.lng : null,
    radius_m: standort ? standort.radius_m : null
  };

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

  return fetch(supabaseBasis() + '/rest/v1/meldungen?select=id', {
    method: 'POST',
    headers: supabaseHeader({ 'Content-Type': 'application/json', Prefer: 'return=representation' }),
    body: JSON.stringify(koerper),
    signal: controller.signal
  }).then(function (antwort) {
    if (!antwort.ok) { throw httpFehler(antwort.status); }
    return antwort.json();
  }).then(function (reihe) {
    const id = Array.isArray(reihe) && reihe[0] ? reihe[0].id : null;
    return { id: id };
  }).finally(function () {
    clearTimeout(timer); // Timer auch bei Erfolg/HTTP-Fehler aufräumen
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
  const anzahl = { alle: state.meldungen.length, verloren: 0, gefunden: 0, verschenken: 0 };
  state.meldungen.forEach(function (meldung) {
    if (anzahl[meldung.art] != null) { anzahl[meldung.art] += 1; }
  });

  const beschriftung = { alle: 'Alle', verloren: 'Verloren', gefunden: 'Gefunden', verschenken: 'Verschenken' };
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
  karte.id = 'meldung-' + meldung.id; // Task 6: Ziel für „Zur Meldung ↓" im Popup

  const badge = karte.querySelector('.badge');
  const art = ART_LABEL[meldung.art] ? meldung.art : 'verloren';
  badge.classList.add(art);
  badge.textContent = ART_LABEL[art];

  const name = String(meldung.name == null ? '' : meldung.name).trim();

  karte.querySelector('.meldungText').textContent = kuerzeText(meldung.text);
  karte.querySelector('.meldungNr').textContent =
    'Nr. ' + FundbueroLogik.formatNummer(meldung.id, meldung.created_at);
  karte.querySelector('.meldungVon').textContent = 'von ' + (name || 'Anonym');
  karte.querySelector('.meldungDatum').textContent = FundbueroLogik.formatDatum(meldung.created_at);

  // Kontaktweg (exklusiv, aktive Wahl des Posters):
  // „offen" → Kontaktangabe steht auf der Karte; „postfach" → Antwort-Knopf.
  const kontaktZeile = karte.querySelector('.meldungKontakt');
  const antwort = karte.querySelector('.antwortBtn');
  if (meldung.kontakt_modus === 'offen') {
    const offen = String(meldung.kontakt == null ? '' : meldung.kontakt).trim();
    if (kontaktZeile && offen) {
      kontaktZeile.hidden = false;
      if (typeof FundbueroIcons !== 'undefined') { kontaktZeile.appendChild(FundbueroIcons.baue('megafon', 13)); }
      kontaktZeile.appendChild(document.createTextNode(' Kontakt: '));
      if (FundbueroLogik.istGueltigeEmail(offen)) {
        const link = document.createElement('a');
        link.href = 'mailto:' + offen;
        link.textContent = offen;
        kontaktZeile.appendChild(link);
      } else {
        kontaktZeile.appendChild(document.createTextNode(offen));
      }
    }
  } else if (meldung.kontakt_modus === 'postfach' && antwort) {
    antwort.hidden = false;
    antwort.addEventListener('click', function () { oeffneKontaktDialog(meldung); });
  }

  if (istNeu(meldung.created_at)) {
    karte.querySelector('.neuChip').hidden = false;
  }

  // Icons im geklonten Template füllen (platzierte data-ico-Spans).
  if (typeof FundbueroIcons !== 'undefined') { FundbueroIcons.ersetzeIcons(karte); }

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
  renderKarte(); // Task 6: Pins (und Bereichs-Kreise) folgen Liste + Filter
}

/* --- Karte (Task 6) --- */

// Tropfen-Pin als L.divIcon: 24 px, rotes „V" / grünes „G", weiße
// 2-px-Kontur, Schatten — Optik aus dem Mockup (sidebar.html). Das
// HTML ist rein statisch und enthält keine Nutzertexte.
function pinIcon(art) {
  const farben = PIN_FARBEN[art] || PIN_FARBEN.verloren;
  return L.divIcon({
    className: '',
    html: '<div style="width:24px;height:24px;background:linear-gradient(' + farben.hell + ',' + farben.dunkel + ');border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid #fff;box-shadow:0 2px 4px rgba(0,0,0,.45);">' +
      '<div style="transform:rotate(45deg);width:20px;height:20px;line-height:20px;text-align:center;color:#fff;font-weight:bold;font-size:11px;">' + farben.buchstabe + '</div></div>',
    iconSize: [24, 24],
    iconAnchor: [12, 25],
    popupAnchor: [0, -23]
  });
}

// Popup-Kurztext: höchstens 120 Zeichen, sonst „…" (wie kuerzeText im Feed).
function kuerzePopupText(text) {
  const sauber = String(text == null ? '' : text);
  return sauber.length > POPUP_TEXT_MAX ? sauber.slice(0, POPUP_TEXT_MAX) + '…' : sauber;
}

// Popup-HTML: Badge, Kurztext, Nummer, Name (leer → „Anonym"), Datum und
// der Link zurück in die Liste. Leaflet nimmt HTML — deshalb sind ALLE
// dynamischen Texte durch FundbueroLogik.escapeHtml geschützt.
function popupHtml(meldung) {
  const escape = FundbueroLogik.escapeHtml;
  const art = ART_LABEL[meldung.art] ? meldung.art : 'verloren';
  const name = String(meldung.name == null ? '' : meldung.name).trim();
  const idText = escape(String(meldung.id));
  return '<span class="badge ' + art + '">' + ART_LABEL[art] + '</span>' +
    '<b class="popupText">' + escape(kuerzePopupText(meldung.text)) + '</b>' +
    '<div class="popupMeta">' +
      '<span class="popupNr">Nr. ' + escape(FundbueroLogik.formatNummer(meldung.id, meldung.created_at)) + '</span> · von ' +
      escape(name || 'Anonym') + ' · ' + escape(FundbueroLogik.formatDatum(meldung.created_at)) +
    '</div>' +
    '<a class="popupLink" href="#meldung-' + idText + '" data-meldung="' + idText + '">Zur Meldung ↓</a>';
}

// Eine Meldung als Marker (+ Bereichs-Kreis, wenn radius_m > 0) einhängen.
// Ohne gültige Koordinaten (istGueltigeKoordinate) wird nichts gezeichnet.
function fuegeMeldungZurKarte(meldung) {
  if (!FundbueroLogik.istGueltigeKoordinate(meldung.lat, meldung.lng)) { return; }

  const farben = PIN_FARBEN[meldung.art] || PIN_FARBEN.verloren;
  L.marker([meldung.lat, meldung.lng], { icon: pinIcon(meldung.art) })
    .addTo(pinEbene)
    .bindPopup(popupHtml(meldung));

  const radius = Number(meldung.radius_m);
  if (radius > 0) {
    L.circle([meldung.lat, meldung.lng], {
      radius: radius,
      color: farben.dunkel,
      weight: 2,
      fillColor: farben.dunkel,
      fillOpacity: 0.12
    }).addTo(kreisEbene);
  }
}

// Pin-Zähler, Mobil-Button-Text und aria-expanded synchron halten
// (#mapBox trägt mobil die Klasse „zu" = eingeklappt).
function aktualisiereKarteToggle() {
  const box = document.getElementById('mapBox');
  const button = document.getElementById('mapToggle');
  const zaehler = document.querySelector('.pinZaehler');
  const zu = !!(box && box.classList.contains('zu'));

  if (button) {
    const text = document.getElementById('mapToggleText');
    if (text) {
      text.textContent = zu ? ('Karte anzeigen (' + pinAnzahl + ')') : 'Karte verbergen';
    }
    button.setAttribute('aria-expanded', zu ? 'false' : 'true');
  }
  if (zaehler) {
    zaehler.textContent = pinAnzahl + (pinAnzahl === 1 ? ' Pin' : ' Pins');
  }
}

// Neu zeichnen: erst die Pins der (gefilterten) Liste zählen — damit stimmen
// Zähler, Leerzustand und Mobil-Button auch ohne (oder vor) Leaflet — dann
// Marker- und Kreis-Ebene leeren und frisch aufbauen. Der Tile-Layer bleibt.
function renderKarte() {
  const sichtbar = sortierteMeldungen();
  pinAnzahl = 0;
  sichtbar.forEach(function (meldung) {
    if (FundbueroLogik.istGueltigeKoordinate(meldung.lat, meldung.lng)) { pinAnzahl += 1; }
  });
  aktualisiereKarteToggle();

  // Task 8: Hinweis nur, wenn (in der aktuellen Filterung) kein Pin da ist.
  const leerHinweis = document.getElementById('mapLeer');
  if (leerHinweis) { leerHinweis.hidden = pinAnzahl !== 0; }

  if (!karte || !pinEbene || !kreisEbene) { return; }

  pinEbene.clearLayers();
  kreisEbene.clearLayers();
  sichtbar.forEach(fuegeMeldungZurKarte);
}

// Leaflet-Karte in #mapSidebar aufbauen: Deutschland-Mitte, Zoom 6, kein
// Scroll-Zoom (Zoom-Buttons per Default), OSM-Tiles mit Attribution. Fehlt
// Leaflet (CDN/offline), bleibt die Seite ohne Karte voll funktionsfähig.
function initialisiereKarte() {
  const behaelter = document.getElementById('mapSidebar');
  if (!behaelter || typeof L === 'undefined' || !L || typeof L.map !== 'function') { return; }

  karte = L.map(behaelter, { scrollWheelZoom: false, zoomControl: true }).setView(KARTE_MITTE, KARTE_ZOOM);
  L.tileLayer(KARTE_TILES, { maxZoom: 19, attribution: KARTE_ATTRIBUTION }).addTo(karte);
  pinEbene = L.layerGroup().addTo(karte);
  kreisEbene = L.layerGroup().addTo(karte);

  renderKarte(); // Stand direkt nach dem ersten Feed-Render zeichnen
}

// Mobil (≤ 860 px) startet die Karte eingeklappt; danach klappt der
// #mapToggle-Klick sie ein/aus (Verdrahtung in verdrahteKarte()).
function initialisiereMobilEinklappen() {
  const box = document.getElementById('mapBox');
  if (box && typeof window !== 'undefined' && typeof window.matchMedia === 'function' &&
      window.matchMedia(MOBIL_QUERY).matches) {
    box.classList.add('zu');
  }
  aktualisiereKarteToggle();
}

/* --- Standort im Formular (Task 7) --- */

// Radius in Metern aus dem Slider (Fallback: Startwert 300).
function radiusWert() {
  const regler = document.getElementById('radius');
  const wert = regler ? Number(regler.value) : NaN;
  return Number.isFinite(wert) && wert > 0 ? wert : RADIUS_START;
}

// Anzeige neben dem Regler: „ca. X m" — funktioniert auch ohne Leaflet.
function aktualisiereRadiusAnzeige() {
  const anzeige = document.getElementById('radiusVal');
  if (anzeige) { anzeige.textContent = 'ca. ' + radiusWert() + ' m'; }
}

// Slider-Eingabe: Anzeige und Kreis live nachziehen. In den Composer-State
// wandert radius_m nur im Bereich-Modus (Punkt = genauer Ort, radius null).
function setzeRadius(wert) {
  const meter = Number(wert);
  const radius = Number.isFinite(meter) && meter > 0 ? meter : RADIUS_START;
  const anzeige = document.getElementById('radiusVal');
  if (anzeige) { anzeige.textContent = 'ca. ' + radius + ' m'; }
  if (kreisMini) { kreisMini.setRadius(radius); }
  if (state.composer.standort && standortModus === 'bereich') {
    state.composer.standort.radius_m = radius;
  }
}

// Setzt/verschiebt den Formular-Pin und synct den Kreis. Erst Klick oder
// Drag zählen als Standort — der vorbelegte Pin auf Deutschland-Mitte
// bleibt bis dahin koordinatenlos (standort null → Payload null).
function setzeStandort(lat, lng) {
  state.composer.standort = {
    lat: lat,
    lng: lng,
    radius_m: standortModus === 'bereich' ? radiusWert() : null
  };
  if (markerMini) { markerMini.setLatLng([lat, lng]); }
  if (kreisMini) { kreisMini.setLatLng([lat, lng]); }
}

// Modus „🎯 Genauer Punkt" / „⭕ Bereich": Optik über aria-pressed (CSS
// wie Mockup: aktiv gelb, inaktiv weiß), Radius-Zeile und Kreis aus- bzw.
// einblenden. Im Punkt-Modus wird radius_m auf null gesetzt.
function setStandortModus(modus) {
  if (modus !== 'punkt' && modus !== 'bereich') { return; }
  standortModus = modus;

  const punktBtn = document.getElementById('btnPunkt');
  const bereichBtn = document.getElementById('btnBereich');
  if (punktBtn) { punktBtn.setAttribute('aria-pressed', modus === 'punkt' ? 'true' : 'false'); }
  if (bereichBtn) { bereichBtn.setAttribute('aria-pressed', modus === 'bereich' ? 'true' : 'false'); }

  const radiusZeile = document.querySelector('#standortBlock .radiusZeile');
  if (radiusZeile) { radiusZeile.hidden = modus === 'punkt'; }

  if (kreisMini) {
    if (modus === 'bereich') {
      kreisMini.setRadius(radiusWert());
      kreisMini.setStyle({ opacity: 1, fillOpacity: 0.12 });
    } else {
      kreisMini.setStyle({ opacity: 0, fillOpacity: 0 });
    }
  }

  if (state.composer.standort) {
    state.composer.standort.radius_m = modus === 'bereich' ? radiusWert() : null;
  }
}

// Erfolgs-Reset (Task 7): Standort vergessen, Modus Bereich, Regler 300 m,
// Pin und Kreis zurück auf Deutschland-Default (Vorbelegung wie beim Start).
function setzeStandortZurueck() {
  state.composer.standort = null;

  const regler = document.getElementById('radius');
  if (regler) { regler.value = String(RADIUS_START); }

  setStandortModus('bereich');
  setzeRadius(RADIUS_START);

  if (markerMini) { markerMini.setLatLng(KARTE_MITTE); }
  if (kreisMini) { kreisMini.setLatLng(KARTE_MITTE); }
  if (karteMini && typeof karteMini.setView === 'function') { karteMini.setView(KARTE_MITTE, KARTE_ZOOM); }
}

// Mini-Karte im Composer: zweite Leaflet-Instanz (kein Scroll-Zoom) wie die
// Seitenkarte auf Deutschland-Mitte/Zoom 6, roter, ziehbarer „verloren"-Pin
// (bleibt immer rot, unabhängig von Verloren/Gefunden) und roter Bereichs-
// Kreis aus dem Regler. Fehlt Leaflet (CDN/offline), bleiben Regler, Pills
// und Modus bedienbar; ohne Klick bleibt standort null und der POST
// überträgt null/null/null.
function initialisiereMiniKarte() {
  const behaelter = document.getElementById('mapMini');
  if (!behaelter || typeof L === 'undefined' || !L || typeof L.map !== 'function') { return; }

  karteMini = L.map(behaelter, { scrollWheelZoom: false, zoomControl: true }).setView(KARTE_MITTE, KARTE_ZOOM);
  L.tileLayer(KARTE_TILES, { maxZoom: 19, attribution: KARTE_ATTRIBUTION }).addTo(karteMini);

  markerMini = L.marker(KARTE_MITTE, { icon: pinIcon('verloren'), draggable: true }).addTo(karteMini);
  kreisMini = L.circle(KARTE_MITTE, {
    radius: radiusWert(),
    color: PIN_FARBEN.verloren.dunkel,
    weight: 2,
    fillColor: PIN_FARBEN.verloren.dunkel,
    fillOpacity: 0.12
  }).addTo(karteMini);

  karteMini.on('click', function (ereignis) {
    if (ereignis && ereignis.latlng) { setzeStandort(ereignis.latlng.lat, ereignis.latlng.lng); }
  });
  // Klick/Tap direkt auf den Pin zählt ebenfalls als Standort (der Marker-
  // Klick bubblt nicht zur Karte — deshalb eigener Handler, kein Doppel-Feuern).
  markerMini.on('click', function () {
    const punkt = markerMini.getLatLng();
    setzeStandort(punkt.lat, punkt.lng);
  });
  markerMini.on('drag', function () {
    const punkt = markerMini.getLatLng();
    setzeStandort(punkt.lat, punkt.lng);
  });

  setStandortModus(standortModus); // Kreis-Style und Radius-Zeile initial synchron
}

// Ortssuche (Task A, Variante 🅰️): tippen → Nominatim (OpenStreetMap) fragen
// → hinspringen und Pin setzen; feinjustieren bleibt per Klick/Ziehen.
// Fair-Use: nur auf Enter/Klick (kein Autocomplete), Button sperrt während
// der Anfrage, Status nur per textContent (kein HTML-Sink).
function sucheOrt() {
  const feld = document.getElementById('standortSuche');
  const knopf = document.getElementById('btnOrtSuche');
  const status = document.getElementById('ortSucheStatus');
  function setzeStatus(text) { if (status) { status.textContent = text; } }
  if (!feld || (knopf && knopf.disabled)) { return; }

  const query = feld.value.trim();
  if (query.length < 3) { setzeStatus('Bitte mindestens 3 Zeichen eingeben.'); return; }
  if (!karteMini) { setzeStatus('Karte ist nicht geladen — Ortssuche gerade nicht möglich.'); return; }

  if (knopf) { knopf.disabled = true; }
  setzeStatus('Suche läuft …');

  const controller = (typeof AbortController === 'function') ? new AbortController() : null;
  const timer = controller ? setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS) : null;

  fetch(NOMINATIM_URL + '?format=jsonv2&limit=1&accept-language=de&q=' + encodeURIComponent(query), {
    signal: controller ? controller.signal : undefined,
    headers: { Accept: 'application/json' }
  }).then(function (antwort) {
    if (!antwort.ok) { throw new Error('HTTP ' + antwort.status); }
    return antwort.json();
  }).then(function (treffer) {
    if (!Array.isArray(treffer) || !treffer.length) {
      setzeStatus('Diesen Ort finde ich nicht — klick einfach in die Karte!');
      return;
    }
    const lat = Number(treffer[0].lat);
    const lng = Number(treffer[0].lon);
    if (!FundbueroLogik.istGueltigeKoordinate(lat, lng)) {
      setzeStatus('Diesen Ort finde ich nicht — klick einfach in die Karte!');
      return;
    }
    karteMini.setView([lat, lng], 16);
    setzeStandort(lat, lng);
    const kurz = String(treffer[0].display_name || '').split(',').slice(0, 2).join(',').trim();
    setzeStatus(kurz ? (kurz + ' — Pin gesetzt, gern feinjustieren!') : 'Pin gesetzt — gern feinjustieren!');
  }).catch(function () {
    setzeStatus('Ortssuche gerade nicht erreichbar — klick einfach in die Karte.');
  }).finally(function () {
    if (timer) { clearTimeout(timer); }
    if (knopf) { knopf.disabled = false; }
  });
}

/* ---------- Kontakt-Relay („Antworten" auf eine Meldung) ---------- */

// Aktuelle Meldung im Antwort-Dialog (null = keiner offen) + Sende-Guard.
let kontaktMeldung = null;
let kontaktSendet = false;

function setzeKontaktStatus(text, erfolg) {
  const status = document.getElementById('kontaktStatus');
  if (!status) { return; }
  status.textContent = text;
  status.classList.toggle('ok', !!erfolg);
}

function setzeKontaktSendeZustand(sendet) {
  kontaktSendet = sendet;
  const knopf = document.getElementById('btnKontaktSenden');
  if (knopf) { knopf.disabled = sendet; }
}

// Dialog öffnen: Titel mit Meldungs-Nr., Felder leeren, Fokus ins E-Mail-Feld.
function oeffneKontaktDialog(meldung) {
  const dialog = document.getElementById('kontaktDialog');
  if (!dialog || !meldung) { return; }
  kontaktMeldung = meldung;

  const titel = document.getElementById('kontaktTitel');
  if (titel) {
    titel.textContent = 'Antwort auf Nr. ' +
      FundbueroLogik.formatNummer(meldung.id, meldung.created_at);
  }
  ['kontaktName', 'kontaktEmail', 'kontaktNachricht', 'kontaktWebsite'].forEach(function (id) {
    const feld = document.getElementById(id);
    if (feld) { feld.value = ''; }
  });
  setzeKontaktStatus('', false);
  setzeKontaktSendeZustand(false);

  if (typeof dialog.showModal === 'function') { dialog.showModal(); }
  else { dialog.setAttribute('open', ''); }
  const email = document.getElementById('kontaktEmail');
  if (email) { email.focus(); }
}

function schliesseKontaktDialog() {
  const dialog = document.getElementById('kontaktDialog');
  kontaktMeldung = null;
  if (!dialog) { return; }
  if (typeof dialog.close === 'function' && dialog.open) { dialog.close(); }
  else { dialog.removeAttribute('open'); }
}

// Anfrage an die Supabase-Edge-Function (dort liegt der Briefkasten-Schlitz;
// die Kontaktdaten des Posters verlassen die Datenbank nie in Richtung Browser).
function sendeKontaktAnfrage() {
  if (kontaktSendet || !kontaktMeldung) { return; }
  if (!istKonfiguriert()) {
    setzeKontaktStatus('Das Amt ist noch nicht angeschlossen … Bald geht\'s los!', false);
    return;
  }

  const email = ((document.getElementById('kontaktEmail') || {}).value || '').trim();
  const nachricht = ((document.getElementById('kontaktNachricht') || {}).value || '').trim();
  const name = ((document.getElementById('kontaktName') || {}).value || '').trim();
  const website = ((document.getElementById('kontaktWebsite') || {}).value || '');

  if (!FundbueroLogik.istGueltigeEmail(email)) {
    setzeKontaktStatus('Bitte gib eine gültige E-Mail an — sonst kann dir niemand antworten.', false);
    return;
  }
  if (nachricht.length < 3) {
    setzeKontaktStatus('Schreib noch ein paar Worte — mindestens 3 Zeichen.', false);
    return;
  }

  setzeKontaktSendeZustand(true);
  setzeKontaktStatus('Wird verschickt …', false);

  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);

  // Direkt in die Datenbank: die RPC „nachricht_senden" macht Gate, Log,
  // Drossel & Sperrliste serverseitig — kein Mail-Dienst, kein Dritter.
  fetch(supabaseBasis() + '/rest/v1/rpc/nachricht_senden', {
    method: 'POST',
    headers: supabaseHeader({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      p_meldung_id: kontaktMeldung.id,
      p_name: name,
      p_email: email,
      p_nachricht: nachricht,
      p_honig: website
    }),
    signal: controller.signal
  }).then(function (antwort) {
    return antwort.json().catch(function () { return {}; }).then(function (daten) {
      if (!antwort.ok) {
        const fehler = new Error('HTTP ' + antwort.status);
        fehler.status = antwort.status;
        fehler.daten = daten;
        throw fehler;
      }
      return daten;
    });
  }).then(function (daten) {
    if (daten && daten.ok === false) {
      setzeKontaktStatus(String(daten.fehler || 'Da hat was geklemmt — nochmal probieren.'), false);
      return;
    }
    setzeKontaktStatus('Nachricht ist raus! Die Person liest sie in ihrem Postfach und meldet sich bei dir.', true);
    setTimeout(schliesseKontaktDialog, 2400);
  }).catch(function (fehler) {
    if (fehler && fehler.daten && fehler.daten.fehler) {
      setzeKontaktStatus(String(fehler.daten.fehler), false);
    } else {
      setzeKontaktStatus(FundbueroLogik.fehlerText(statusAus(fehler)), false);
    }
  }).finally(function () {
    clearTimeout(timer);
    setzeKontaktSendeZustand(false);
  });
}

function verdrahteKontakt() {
  const senden = document.getElementById('btnKontaktSenden');
  if (senden) { senden.addEventListener('click', sendeKontaktAnfrage); }

  const abbrechen = document.getElementById('btnKontaktAbbrechen');
  if (abbrechen) { abbrechen.addEventListener('click', schliesseKontaktDialog); }

  const formular = document.getElementById('kontaktFormular');
  if (formular) {
    formular.addEventListener('submit', function (ereignis) {
      ereignis.preventDefault();
      sendeKontaktAnfrage();
    });
  }

  const dialog = document.getElementById('kontaktDialog');
  if (dialog) {
    dialog.addEventListener('close', function () { kontaktMeldung = null; });
  }

  // Kontaktweg: smarter Pill-Switch (aktive Wahl, exklusiv).
  const wahl = document.getElementById('kontaktWahl');
  if (wahl) {
    wahl.addEventListener('click', function (ereignis) {
      const pill = ereignis.target && ereignis.target.closest
        ? ereignis.target.closest('.kontaktPill[data-kontakt]')
        : null;
      if (pill) { setzeKontaktModus(pill.dataset.kontakt); }
    });
  }
  aktualisiereKontaktFeld();
}

/* ---------- Postfach (geheimer Link nach dem Posten) ---------- */

const POSTFACH_KEY = 'fundbueroPostfaecher';

// UUID fürs geheime Postfach — vom Browser erzeugt; sie verlässt den Rechner
// nur als Teil des eigenen Links (und einmal beim Eintragen in die DB).
function neuerPostfachToken() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : ((r & 0x3) | 0x8);
    return v.toString(16);
  });
}

function lesePostfaecher() {
  try {
    const roh = localStorage.getItem(POSTFACH_KEY);
    const liste = roh ? JSON.parse(roh) : [];
    return Array.isArray(liste) ? liste : [];
  } catch (e) {
    return [];
  }
}

function speicherePostfach(eintrag) {
  const liste = lesePostfaecher();
  liste.unshift(eintrag);
  try {
    localStorage.setItem(POSTFACH_KEY, JSON.stringify(liste.slice(0, 50)));
  } catch (e) {
    /* Speicher voll/gesperrt — dann zählt nur der kopierte Link. */
  }
  aktualisierePostfachLink();
}

// Footer-Link: „Meine Beiträge" bzw. „Meine Beiträge (n)".
function aktualisierePostfachLink() {
  const link = document.getElementById('postfachLink');
  if (!link) { return; }
  const anzahl = lesePostfaecher().length;
  link.textContent = anzahl > 0 ? ('Meine Beiträge (' + anzahl + ')') : 'Meine Beiträge';
}

let aktuellePostfachUrl = '';

function zeigePostfachDialog(id, token, text, modus) {
  const dialog = document.getElementById('postfachDialog');
  if (!dialog || !token) { return; }

  const url = new URL('postfach.html', window.location.href).href + '#' + token;
  aktuellePostfachUrl = url;

  // Titel + Hinweis je Kontaktweg (Postfach vs. offener Kontakt).
  const titelEl = document.getElementById('postfachTitelText');
  if (titelEl) {
    titelEl.textContent = modus === 'offen' ? 'Dein Beitrag ist online!' : 'Dein Postfach ist bereit!';
  }
  const hinweisA = document.getElementById('postfachHinweisA');
  const hinweisB = document.getElementById('postfachHinweisB');
  if (hinweisA) { hinweisA.textContent = modus === 'offen' ? 'Dein Beitrag' : 'Antworten auf'; }
  if (hinweisB) { hinweisB.textContent = modus === 'offen' ? 'steht im schwarzen Brett.' : 'landen NUR hier.'; }

  const nrText = id != null
    ? 'Nr. ' + FundbueroLogik.formatNummer(id, new Date().toISOString())
    : 'deine Meldung';
  const nrEl = document.getElementById('postfachNr');
  if (nrEl) { nrEl.textContent = nrText; }
  const linkEl = document.getElementById('postfachLinkText');
  if (linkEl) { linkEl.textContent = url; }
  setzePostfachStatus('', false);

  speicherePostfach({
    token: token,
    id: id,
    nr: nrText,
    titel: String(text || '').slice(0, 60),
    datum: new Date().toISOString(),
    modus: modus || ''
  });

  if (typeof dialog.showModal === 'function') { dialog.showModal(); }
  else { dialog.setAttribute('open', ''); }
}

function setzePostfachStatus(text, erfolg) {
  const status = document.getElementById('postfachStatus');
  if (!status) { return; }
  status.textContent = text;
  status.classList.toggle('ok', !!erfolg);
}

function kopierePostfachLink() {
  if (!aktuellePostfachUrl) { return; }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(aktuellePostfachUrl)
      .then(function () { setzePostfachStatus('Link kopiert! Speicher ihn gut.', true); })
      .catch(function () { setzePostfachStatus('Kopieren ging nicht — bitte markier den Link von Hand.', false); });
  } else {
    setzePostfachStatus('Kopieren geht hier nicht — bitte markier den Link von Hand.', false);
  }
}

// „An mich selbst mailen": öffnet das eigene Mailprogramm mit dem Link —
// Empfänger trägt man selbst ein. Kein Dienst dazwischen.
function mailePostfachLink() {
  if (!aktuellePostfachUrl) { return; }
  const betreff = encodeURIComponent('Mein Postfach im Digitalen Fundbüro');
  const rumpf = encodeURIComponent(
    'Hier ist mein geheimer Postfach-Link — gut aufbewahren!\n\n' + aktuellePostfachUrl
  );
  window.location.href = 'mailto:?subject=' + betreff + '&body=' + rumpf;
}

// Kontaktweg: smarter Pill-Switch — aktive, exklusive Wahl.
function setzeKontaktModus(modus) {
  if (modus !== 'offen' && modus !== 'postfach') { return; }
  state.composer.kontaktModus = modus;
  aktualisiereKontaktFeld();
}

// UI an den gewählten Kontaktweg anpassen: Pills, Info-Zeile, Kontaktfeld.
function aktualisiereKontaktFeld() {
  const modus = state.composer.kontaktModus || '';

  document.querySelectorAll('#kontaktWahl .kontaktPill[data-kontakt]').forEach(function (pill) {
    pill.setAttribute('aria-pressed', pill.dataset.kontakt === modus ? 'true' : 'false');
  });

  const info = document.getElementById('kontaktInfo');
  if (info) {
    if (modus === 'offen') {
      info.textContent = 'Offener Kontakt: Deine Angabe steht im Eintrag — Antworten kommen direkt bei dir an (z. B. per E-Mail).';
    } else if (modus === 'postfach') {
      info.textContent = 'Anonymes Postfach: Keine Angaben nötig — Antworten landen NUR in deinem geheimen Postfach (Link bekommst du nach dem Eintragen).';
    } else {
      info.textContent = 'Wähle einen Weg — du entscheidest, wie man dich erreicht.';
    }
  }

  const block = document.getElementById('kontaktFeldBlock');
  if (block) { block.hidden = modus !== 'offen'; }
}

function verdrahtePostfach() {
  const kopieren = document.getElementById('btnPostfachKopieren');
  if (kopieren) { kopieren.addEventListener('click', kopierePostfachLink); }

  const mailen = document.getElementById('btnPostfachMailen');
  if (mailen) { mailen.addEventListener('click', mailePostfachLink); }

  const fertig = document.getElementById('btnPostfachFertig');
  if (fertig) {
    fertig.addEventListener('click', function () {
      const dialog = document.getElementById('postfachDialog');
      if (!dialog) { return; }
      if (typeof dialog.close === 'function' && dialog.open) { dialog.close(); }
      else { dialog.removeAttribute('open'); }
    });
  }

  aktualisierePostfachLink();
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
  renderFeed(); // rendert Liste UND Pins (renderFeed → renderKarte)
}

// --- Composer: Tastatur, Art-Pills, Validierung ---

// Art-Pills: Optik kommt übers CSS (aria-pressed), hier nur State + A11y.
function setArt(art) {
  if (!ART_LABEL[art]) { return; }
  state.composer.art = art;
  document.querySelectorAll('#composer .artPill[data-art]').forEach(function (pill) {
    pill.setAttribute('aria-pressed', pill.dataset.art === art ? 'true' : 'false');
  });
  const titel = document.getElementById('composerTitel');
  if (titel) { titel.textContent = TITEL_TEXT[art]; }
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

// Erfolg: Felder leeren, Art zurück auf VERLOREN, Zähler 0/500, Standort
// vergessen (Task 7: Modus Bereich, 300 m, Pin/Kreis auf Deutschland-Default)
// und die Kontaktweg-Wahl zurücksetzen (aktive Wahl bleibt bewusst offen).
function leereFormular() {
  const feldText = document.getElementById('eingabeText');
  const feldName = document.getElementById('eingabeName');
  const feldKontakt = document.getElementById('eingabeKontakt');
  if (feldText) { feldText.value = ''; }
  if (feldName) { feldName.value = ''; }
  if (feldKontakt) { feldKontakt.value = ''; }
  document.querySelectorAll('#kontaktWahl input[name="kontaktModus"]').forEach(function (radio) {
    radio.checked = false;
  });
  state.composer.kontaktModus = '';
  aktualisiereKontaktFeld();
  setArt('verloren');
  setzeStandortZurueck();
  aktualisiereZaehler();
}

// Task 5: POST + Erfolgs-/Fehlerfluss. Erfolg räumt das Formular, zeigt die
// Erfolgszeile, lädt frisch vom Amt — und beim Postfach-Weg zusätzlich den
// Postfach-Dialog mit dem geheimen Link.
function sendeMeldung(daten) {
  setzeSendeZustand(true);
  postMeldung(daten)
    .then(function (ergebnis) {
      leereFormular();
      zeigeFormStatus('Eingetragen! Die Lupe macht sich auf die Suche. 🔍', true);
      if (daten.postfach_token) {
        zeigePostfachDialog(ergebnis ? ergebnis.id : null, daten.postfach_token, daten.text, daten.kontakt_modus);
      }
      return ladeMeldungen();
    })
    .catch(function (fehler) {
      zeigeFormStatus(FundbueroLogik.fehlerText(statusAus(fehler)), false);
    })
    .then(function () {
      setzeSendeZustand(false);
    });
}

// Task 4/5 + Kontaktweg: validieren, Fehler zeigen — sonst an Supabase senden.
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

  // Kontaktweg ist eine aktive Entscheidung — ohne Wahl geht nichts raus.
  const kontaktModus = state.composer.kontaktModus || '';
  if (!kontaktModus) {
    zeigeFormStatus('Bitte wähle erst, wie man dich erreichen soll: „Offener Kontakt" oder „Anonymes Postfach".', false);
    return;
  }
  if (kontaktModus === 'offen' && String(ergebnis.daten.kontakt || '').trim().length < 3) {
    zeigeFormStatus('Beim offenen Kontakt brauchen wir eine Angabe (z. B. E-Mail) — sonst kann dich niemand erreichen.', false);
    if (feldKontakt) { feldKontakt.focus(); }
    return;
  }

  zeigeFormStatus('', false); // alte Fehler wegräumen
  if (!istKonfiguriert()) {
    zeigeFormStatus('Das Amt ist noch nicht angeschlossen … Bald geht\'s los!', false);
    return;
  }

  // Exklusiver Weg: „offen" → Kontakt wird angezeigt; „postfach" → Antworten
  // landen im geheimen Postfach. JEDER Beitrag bekommt einen geheimen Token —
  // damit lässt sich der Beitrag später auch wieder löschen (ohne Konto).
  sendeMeldung({
    art: ergebnis.daten.art,
    text: ergebnis.daten.text,
    name: ergebnis.daten.name,
    kontakt: kontaktModus === 'offen' ? ergebnis.daten.kontakt : null,
    kontakt_modus: kontaktModus,
    postfach_token: neuerPostfachToken()
  });
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

// Task 7: Modus-Pills („🎯 Genauer Punkt" / „⭕ Bereich") und Radius-
// Regler des Standort-Blocks verdrahten.
function verdrahteStandort() {
  const punktBtn = document.getElementById('btnPunkt');
  if (punktBtn) {
    punktBtn.addEventListener('click', function () { setStandortModus('punkt'); });
  }

  const bereichBtn = document.getElementById('btnBereich');
  if (bereichBtn) {
    bereichBtn.addEventListener('click', function () { setStandortModus('bereich'); });
  }

  const regler = document.getElementById('radius');
  if (regler) {
    regler.addEventListener('input', function () { setzeRadius(regler.value); });
  }

  // Ortssuche: Enter im Feld oder Klick auf „🔍 Suchen".
  const suchFeld = document.getElementById('standortSuche');
  if (suchFeld) {
    suchFeld.addEventListener('keydown', function (ereignis) {
      if (ereignis.key === 'Enter') { ereignis.preventDefault(); sucheOrt(); }
    });
  }
  const suchKnopf = document.getElementById('btnOrtSuche');
  if (suchKnopf) {
    suchKnopf.addEventListener('click', sucheOrt);
  }
}

// Task 6: Mobiler Karten-Button („Karte anzeigen (n)" / „Karte verbergen")
// und die Popup-Links „Zur Meldung ↓" in der Sidebar-Karte verdrahten.
function verdrahteKarte() {
  const toggle = document.getElementById('mapToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      const box = document.getElementById('mapBox');
      if (!box) { return; }
      box.classList.toggle('zu');
      aktualisiereKarteToggle();
      // Aus der display:none-Ecke aufgetaucht → Leaflet muss neu messen.
      if (!box.classList.contains('zu') && karte && typeof karte.invalidateSize === 'function') {
        karte.invalidateSize();
      }
    });
  }

  const behaelter = document.getElementById('mapSidebar');
  if (behaelter) {
    behaelter.addEventListener('click', function (ereignis) {
      const ziel = ereignis.target;
      const link = ziel && typeof ziel.closest === 'function'
        ? ziel.closest('a.popupLink[data-meldung]')
        : null;
      if (!link) { return; }
      ereignis.preventDefault();
      zeigeMeldungInListe(link.dataset.meldung);
      if (karte && typeof karte.closePopup === 'function') { karte.closePopup(); }
    });
  }
}

// Popup-Link: zur zugehörigen Feed-Karte scrollen und sie 2 s hervorheben.
function zeigeMeldungInListe(id) {
  const karteInListe = document.getElementById('meldung-' + id);
  if (!karteInListe) { return; }
  karteInListe.scrollIntoView({ behavior: 'smooth', block: 'center' });
  karteInListe.classList.add('meldungHervor');
  window.setTimeout(function () {
    karteInListe.classList.remove('meldungHervor');
  }, HERVOR_MS);
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

  verdrahteKarte(); // Task 6: Karten-Toggle + Popup-Links

  verdrahteComposer();
  verdrahteStandort(); // Task 7: Modus-Pills + Radius-Regler
  verdrahteKontakt(); // Antwort-Dialog + aktive Kontaktweg-Wahl
  verdrahtePostfach(); // Postfach-Dialog + Footer-Link
}

/* ---------- 5. Init ---------- */

function init() {
  baueTastatur();
  verdrahteEvents();
  setArt(state.composer.art);
  aktualisiereZaehler();
  aktualisiereRadiusAnzeige(); // Task 7: Regler-Anzeige aus dem Slider
  initialisiereMobilEinklappen(); // Task 6: mobil startet die Karte eingeklappt
  initialisiereMiniKarte(); // Task 7: Standort-Mini-Karte im Composer
  ladeMeldungen(); // Task 5: echte Einträge aus Supabase oder Nicht-angeschlossen-Hinweis
  initialisiereKarte(); // Task 6: Leaflet nach dem ersten renderFeed() aufbauen
}

init();
