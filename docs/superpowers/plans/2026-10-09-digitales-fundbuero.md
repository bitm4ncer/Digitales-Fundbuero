# Digitales Fundbüro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Statische Y2K-Webseite „Digitales Fundbüro" mit geteiltem Supabase-Feed, on-screen-Tastatur und OpenStreetMap-Karte (Sidebar) bauen und auf GitHub Pages deployen.

**Architecture:** Reines Vanilla-Frontend ohne Build-Step (HTML/CSS/JS) auf GitHub Pages. Daten über die Supabase-REST-API (anon key, RLS erlaubt nur `select`+`insert`). Karte via Leaflet-1.9.4-CDN und OSM-Tiles. Reine Logik liegt testbar in `logic.js` (läuft im Browser als Global und in Node via UMD-Shim).

**Tech Stack:** HTML5, CSS, Vanilla JS (ES5-taugliche Syntax für den Y2K-Charme, aber moderne Browser-Features erlaubt), Leaflet 1.9.4 (CDN), Supabase REST (Postgres), Node `node --test` (keine Dependencies), eigener Mini-Dev-Server (`dev-server.js`, nur Node-Bordmittel).

**Spec:** `docs/superpowers/specs/2026-10-09-digitales-fundbuero-design.md`

## Global Constraints

- **Kein Build-Step, kein npm, kein Framework.** Nur Browser-Dateien + `node --test` + `dev-server.js`.
- **UI-Sprache Deutsch, „du"-Ton**, humorvoll; Fehlermeldungen exakt wie im Spec-Ton.
- **Design exakt nach Mockups** (`docs/design-references/`): Stadtblau `#1a3e6e`/`#2a68c4`, Verläufe `#4b8de0→#1d5eb8→#164a96`, Gelb `#ffd200→#f7b400`, Maskottchen-Sprechblase „Hi, ich bin Fundbüro!", Ticker `★ Willkommen! Eintragen dauert 10 Sekunden — 100% kostenlos! ★`, CTA „JETZT EINTRAGEN!", Footer „© 2003–2026 Digitales Fundbüro · Impressum · Datenschutz · Du bist Besucher Nr. 0044711".
- **Formate:** Nummer `JJJJ-NNNN` (z. B. `2026-0042`, nicht abschneiden), Datum `TT.MM.JJJJ`, `NEU!` < 24 h.
- **Grenzen:** text 3–500 (getrimmt), name ≤ 60, kontakt ≤ 200, Radius UI 50–1000 m (Default 300), DB-Guard 25–2000.
- **Supabase:** nur `select` + `insert`; anon key darf in `config.js`; **service_role key niemals** ins Repo. Tabelle + Policies: `docs/supabase-setup.sql`.
- **Leaflet 1.9.4** von unpkg (`leaflet.css`, `leaflet.js`); OSM-Tiles `https://tile.openstreetmap.org/{z}/{x}/{y}.png`; Attribution „© OpenStreetMap-Mitwirkende" immer sichtbar; `scrollWheelZoom: false`.
- **Standort-Regel:** `lat`/`lng` NULL = kein Standort; `radius_m` NULL = genauer Punkt; `radius_m > 0` = Bereich.
- **Alle Nutzertexte werden escaped** (`escapeHtml`) — niemals rohes `innerHTML` mit Nutzerinhalt.
- **Kein Auto-Polling.** „🔄 Aktualisieren"-Button + Reload nach dem Posten.
- Commits klein und pro Task; Commit-Messages wie im jeweiligen Task angegeben.

## Review Focus

Five input classes / failure modes the spec implies but no happy-path test exercises. Each gets its test in the named task.

1. **Nutzertext mit HTML/Quotes (`<img onerror>`, `"`, `'`)** → muss escaped werden, niemals ausgeführt — `escapeHtml`-Tests in Task 1, Einsatz in Task 3.
2. **Netz-/Supabase-Fehler (offline, 401 durch falschen Key, 5xx)** → freundliche Meldung statt Absturz/ leere Seite — `fehlerText`-Tests in Task 1, Fehlerpfade in Task 5.
3. **Mehrzeichen-Einfügen & Selektion in der Tastatur** (Emoji/Umlaute, Ersetzen einer Auswahl, Einfügen am Ende) → korrekte Cursorposition — Tests in Task 1, Verdrahtung in Task 4.
4. **Ungültige/fehlende Koordinaten** (`null`, Strings, außerhalb ±90/±180) → Marker/Kreis überspringen, kein Crash — `istGueltigeKoordinate`-Tests in Task 1, Nutzung in Task 6.
5. **Doppelklick auf „JETZT EINTRAGEN!"** → genau ein Insert (Button gesperrt, Reentrancy-Guard) — Verhalten in Task 5.

---

### Task 1: Pure Logik (`logic.js`) + Node-Tests

**Files:**
- Create: `logic.js`
- Create: `tests/logic.test.js`

**Interfaces:**
- Produces (alle späteren Tasks nutzen exakt diese Namen):
  - `formatNummer(id: number, createdAt: string) -> string` → `"2026-0042"`
  - `formatDatum(iso: string) -> string` → `"09.10.2026"` (lokale Zeit)
  - `escapeHtml(text: string) -> string`
  - `validiereMeldung(daten: {art: string, text: string, name?: string, kontakt?: string}) -> {ok: boolean, fehler: string[], daten: {art: string, text: string, name: string|null, kontakt: string|null}}`
  - `insertFuerText(text: string, start: number, ende: number, zeichen: string) -> {text: string, pos: number}`
  - `loescheZurueck(text: string, start: number, ende: number) -> {text: string, pos: number}`
  - `istGueltigeKoordinate(lat: unknown, lng: unknown) -> boolean`
  - `fehlerText(status: number|null) -> string`
- UMD-Shim: Browser-Global `window.FundbueroLogik`, Node `module.exports` (Muster siehe Schritt 3).

- [ ] **Step 1: Failing Tests schreiben** — `tests/logic.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../logic.js');

test('formatNummer: polstert auf vier Stellen', () => {
  assert.equal(L.formatNummer(42, '2026-10-09T12:00:00Z'), '2026-0042');
  assert.equal(L.formatNummer(7, '2026-01-01T12:00:00Z'), '2026-0007');
  assert.equal(L.formatNummer(123456, '2026-10-09T12:00:00Z'), '2026-123456');
});

test('formatDatum: TT.MM.JJJJ', () => {
  assert.equal(L.formatDatum('2026-10-09T12:00:00Z'), '09.10.2026');
});

test('escapeHtml: maskiert alle gefährlichen Zeichen', () => {
  assert.equal(L.escapeHtml('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;');
  assert.equal(L.escapeHtml("Tom & 'Jerry'"), 'Tom &amp; &#39;Jerry&#39;');
});

test('validiereMeldung: trims, prüft Pflichtfeld und Grenzen', () => {
  const ok = L.validiereMeldung({ art: 'verloren', text: '  Hallo Welt  ' });
  assert.equal(ok.ok, true);
  assert.equal(ok.daten.text, 'Hallo Welt');
  assert.equal(ok.daten.name, null);
  assert.equal(ok.daten.kontakt, null);
  assert.equal(L.validiereMeldung({ art: 'verloren', text: 'ab' }).ok, false);
  assert.equal(L.validiereMeldung({ art: 'weg', text: 'Hallo Welt' }).ok, false);
  assert.equal(L.validiereMeldung({ art: 'verloren', text: 'Hallo', name: 'x'.repeat(61) }).ok, false);
  assert.equal(L.validiereMeldung({ art: 'verloren', text: 'Hallo', kontakt: 'x'.repeat(201) }).ok, false);
});

test('insertFuerText: Einfügen, Ersetzen, Mehrzeichen', () => {
  assert.deepEqual(L.insertFuerText('Hallo', 5, 5, '!'), { text: 'Hallo!', pos: 6 });
  assert.deepEqual(L.insertFuerText('Hallo Welt', 6, 10, 'du'), { text: 'Hallo du', pos: 8 });
  assert.deepEqual(L.insertFuerText('test', 0, 4, ''), { text: '', pos: 0 });
  assert.deepEqual(L.insertFuerText('Hallo', 99, 99, '!'), { text: 'Hallo!', pos: 6 }); // clamp
  assert.deepEqual(L.insertFuerText('Hallo ät', 5, 5, '…'), { text: 'Hallo… ät', pos: 6 });
});

test('loescheZurueck: löscht Auswahl oder Zeichen davor', () => {
  assert.deepEqual(L.loescheZurueck('Hallo', 5, 5), { text: 'Hall', pos: 4 });
  assert.deepEqual(L.loescheZurueck('Hallo', 2, 4), { text: 'Hlo', pos: 2 });
  assert.deepEqual(L.loescheZurueck('Hallo', 0, 0), { text: 'Hallo', pos: 0 });
});

test('istGueltigeKoordinate: akzeptiert nur endliche Werte im Bereich', () => {
  assert.equal(L.istGueltigeKoordinate(48.1, 11.5), true);
  assert.equal(L.istGueltigeKoordinate(null, 11), false);
  assert.equal(L.istGueltigeKoordinate('abc', 11), false);
  assert.equal(L.istGueltigeKoordinate(91, 11), false);
  assert.equal(L.istGueltigeKoordinate(48, 181), false);
});

test('fehlerText: freundliche Meldungen je Status', () => {
  assert.match(L.fehlerText(null), /Kabel zum Amt/);
  assert.match(L.fehlerText(401), /Schlüssel/);
  assert.match(L.fehlerText(500), /schiefgelaufen/);
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `node --test tests/logic.test.js`
Expected: FAIL (`Cannot find module '../logic.js'`)

- [ ] **Step 3: `logic.js` implementieren** (UMD-Shim, Body frei):

```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.FundbueroLogik = factory(); }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // formatNummer, formatDatum, escapeHtml, validiereMeldung,
  // insertFuerText, loescheZurueck, istGueltigeKoordinate, fehlerText
  // ... und als Objekt zurückgeben.
}));
```

Exakte Meldungstexte für `fehlerText`: `null` → `'Mist, das Kabel zum Amt ist verstopft. Nochmal versuchen?'`; `401/403` → `'Das Amt hat uns nicht erkannt (Schlüssel falsch?). Sag dem Betreiber Bescheid!'`; `5xx/andere Zahl` → `'Beim Amt ist was schiefgelaufen. Gleich nochmal probieren!'`.

- [ ] **Step 4: Tests laufen lassen — müssen bestehen**

Run: `node --test tests/logic.test.js`
Expected: PASS (8 Tests)

- [ ] **Step 5: Commit**

```bash
git add logic.js tests/logic.test.js
git commit -m "feat: pure Logik (Nummern, Datum, Escaping, Validierung, Tastatur-Einfügen) mit Node-Tests"
```

---

### Task 2: Grundgerüst & Look-Rahmen (`index.html`, `style.css`, Assets, Dev-Server)

**Files:**
- Create: `index.html`, `style.css`, `dev-server.js`, `assets/lupe.svg`, `assets/favicon.svg`

**Interfaces:**
- Produces: DOM-IDs, auf die alle späteren Tasks bauen:
  `#filterBar`, `#aktualisieren`, `#feedListe`, `#feedLeer`, `#statusHinweis`, `#tplMeldung` (template), `#mapBox`, `#mapToggle`, `#mapSidebar`, `#composer`, `#eingabeName`, `#eingabeKontakt`, `#eingabeText`, `#zeichenZaehler`, `#tastatur`, `#standortBlock`, `#mapMini`, `#btnPunkt`, `#btnBereich`, `#radius`, `#radiusVal`, `#btnAbsenden`, `#formStatus`. Struktur = Mockup `docs/design-references/sidebar.html` (Header, Ticker, Grid „Feed links / Karte rechts", Footer).
- `dev-server.js`: `node dev-server.js` → `http://localhost:8080`, liefert statische Dateien aus dem Repo-Root, `Content-Type` für html/css/js/svg/json, schützt gegen `..`-Pfade.

- [ ] **Step 1: `assets/lupe.svg` + `assets/favicon.svg` anlegen** — Lupe mit Gesicht exakt aus dem Mockup (`docs/design-references/sidebar.html`, der `<svg>`-Block im Header); Favicon = vereinfachte Lupe (Kreis + Stiel) auf Blau.
- [ ] **Step 2: `index.html` bauen** — Kopf (`<title>Digitales Fundbüro — Verlorenes & Gefundenes</title>`, meta viewport, Leaflet-CSS-CDN, `style.css`), Body nach Mockup: Header mit Lupe + Wortmarke + Sticker + Sprechblase, Ticker, Grid (`<main class="layout">`: Feed-Spalte + `<aside id="mapBox">` mit Kartenfenster `#mapSidebar`, Button `#mapToggle` nur mobil), Formular `#composer` (im Feed-Bereich), Footer. Karten-Template `<template id="tplMeldung">`. Scripts am Ende: `config.js`, `logic.js`, Leaflet-JS-CDN, `app.js`.
- [ ] **Step 3: `style.css` bauen** — Palette als CSS-Variablen; Layout-Grid `grid-template-columns: minmax(0,1fr) 360px; gap: 16px;`, `#mapBox { position: sticky; top: 16px; }`; Ticker, Pills, Badges (rot/grün, glossy), Karten, Composer, Tastatur-Grundstyle, Footer, `@media (max-width: 860px)`: einspaltig, `#mapToggle` sichtbar, `#mapBox.zu` eingeklappt; Leaflet-Popup-Font-Override.
- [ ] **Step 4: `dev-server.js` schreiben** (Node `http`+`fs`, ~40 Zeilen, MIME-Map, 404-Seite im Look via Klartext).
- [ ] **Step 5: Verifizieren** — `node dev-server.js` starten, `http://localhost:8080` öffnen.
Expected: Header mit Lupe/Sticker/Sprechblase, gelber Ticker, leere Feed-Spalte, Kartenfenster-Rahmen rechts (Karte lädt in Task 6), Formular-Rahmen, Footer — keine Console-Fehler (außer 404 auf `config.js`/`app.js`, die noch fehlen; deshalb leere `config.js`/`app.js` als Platzhalter anlegen).
- [ ] **Step 6: Commit**

```bash
git add index.html style.css dev-server.js assets/ config.js app.js
git commit -m "feat: Grundgerüst mit Look-Rahmen (Header, Ticker, Layout, Dev-Server)"
```

---

### Task 3: Feed-Liste mit Demo-Daten + Filter

**Files:**
- Create/Modify: `app.js` (erste Ausbaustufe), `index.html` (Pills in `#filterBar` sind statisch vorhanden)

**Interfaces:**
- Consumes: `FundbueroLogik.formatNummer/formatDatum/escapeHtml`; DOM-IDs aus Task 2.
- Produces: `state = { meldungen: [], filter: 'alle' }`; `renderFeed()`; `setFilter(f: 'alle'|'verloren'|'gefunden')`; Demo-Daten über `const DEMO_MELDUNGEN = [...]` (wird in Task 5 durch fetch ersetzt). Kartenlayout exakt wie Mockup: Badge, Text (≤ 220 Zeichen + „…"), `Nr. JJJJ-NNNN` (blau fett), `von <Name|Anonym> · TT.MM.JJJJ`, `NEU!`-Sternchen < 24 h; kein Name → „Anonym".

- [ ] **Step 1: Rendering + Filter implementieren** — `app.js`: Demo-Array mit 4 Meldungen aus dem Mockup (Mia/Jonas/Fundbüro/Anonym, inkl. Koordinaten aus `docs/supabase-setup.sql`), `renderFeed()` klont `#tplMeldung`, füllt via `textContent`/`escapeHtml`, setzt Zähler an den Pills (`Alle (4) · Verloren (2) · Gefunden (2)`), blendet bei leerer Liste `#feedLeer` ein (Lupe + `„Ich habe noch nichts gefunden … Meldest du was?"`). `#aktualisieren` ruft vorerst nur `renderFeed()`.
- [ ] **Step 2: Verifizieren** — Server läuft, Seite laden.
Expected: 4 Karten, korrekte Nummern (`Nr. 2026-0042` usw.), grüne/rote Badges, `NEU!` nur bei Mia; Filter-Klicks zeigen je 2 bzw. 4 Karten; Console sauber.
- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat: Feed-Liste mit Demo-Daten, Filtern und Zählern"
```

---

### Task 4: Composer + on-screen-Tastatur

**Files:**
- Modify: `app.js`, `index.html` (Tastatur-Container bleibt leer, wird per JS gefüllt), `style.css` (gedrückter Zustand)

**Interfaces:**
- Consumes: `insertFuerText`, `loescheZurueck`, `validiereMeldung` aus Task 1; DOM-IDs aus Task 2.
- Produces: Composer-State `{ art: 'verloren', standort: null }`; Tasten-Kappen `A–Z, 0–9, Ä Ö Ü ß, . , ? !` (mit `LEERTASTE`/`⌫` als breite Sondertasten) — **eingefügt werden Kleinbuchstaben** (`ä ö ü ß`), Shift gibt's bewusst nicht; Funktion `fuegeZeichenEin(zeichen)` und `verarbeiteAbsenden()` (in Task 5 um POST erweitert). Tastenklick: `preventDefault`, Fokus zurück ins Textfeld, Einfügen an `selectionStart/End`, exakt per `FundbueroLogik`. Physische Tastatur bleibt normal nutzbar. Zeichenzähler `#zeichenZaehler` zeigt `n/500`.

- [ ] **Step 1: Tastatur + Formularverhalten bauen** — Keys als `<button type="button">` generieren; `⌫` und `LEERTASTE` als breite Sondertasten; `:active`-Inset wie im Mockup; Verloren/Gefunden-Pills schalten `aria-pressed` + Optik (gelb vs. weiß); Validierungsfehler erscheinen in `#formStatus` (Ton: die `fehler`-Strings aus `validiereMeldung`).
- [ ] **Step 2: Verifizieren** — Tippen ausschließlich per Klick-Tasten (inkl. `⌫` mitten im Satz, `LEERTASTE`, Umlaut); Text markieren und Taste drücken → Auswahl wird ersetzt; Zähler zählt mit; „JETZT EINTRAGEN!" mit zu kurzem Text → Fehlermeldung in `#formStatus`; Console sauber.
- [ ] **Step 3: Commit**

```bash
git add app.js index.html style.css
git commit -m "feat: Composer mit anklickbarer Tastatur und Validierung"
```

---

### Task 5: Supabase-Anbindung (echter geteilter Feed)

**Files:**
- Modify: `config.js`, `app.js` (Demo raus, fetch rein)
- Verify gegen: `docs/supabase-setup.sql`

**Interfaces:**
- Consumes: alles aus Task 1/3/4.
- Produces: `istKonfiguriert() -> boolean`; `ladeMeldungen() -> Promise`; `postMeldung(daten) -> Promise` (GET: `{basis}/rest/v1/meldungen?select=*&order=id.desc&limit=200`; POST: `{basis}/rest/v1/meldungen` mit `Prefer: return=minimal`; Header `apikey` + `Authorization: Bearer <anon>`; leere Optionals als `null` senden). Sende-Guard: Variable `sendet = false`, Button gesperrt + `disabled` während des Requests. Unkonfiguriert → `#statusHinweis` mit `'Das Amt ist noch nicht angeschlossen … Bald geht's los!'`, Demo-Daten werden **nicht** mehr gerendert.

- [ ] **Step 1: Betreiber-Schritt ausführen** — Supabase-Projekt (Free Tier, Frankfurt) anlegen, `docs/supabase-setup.sql` im SQL-Editor ausführen (inkl. optionaler Seeds), Project-URL + anon key in `config.js` eintragen.
- [ ] **Step 2: fetch-Code implementieren** — Fehlerpfade über `fehlerText(status)`; Netzfehler (`TypeError`) → `fehlerText(null)`; nach Erfolg: Formular leeren, `ladeMeldungen()` erneut, `#formStatus` = `'Eingetragen! Die Lupe macht sich auf die Suche. 🔍'`.
- [ ] **Step 3: Verifizieren (live)** — Seite laden.
Expected: echte Einträge aus Supabase erscheinen (Seeds + vorherige), neuer Eintrag via Formular erscheint sofort oben mit neuer `Nr.`; `config.js` leeren → Hinweis statt Fehler; im DevTools-Netzwerk-Offline-Modus absenden → `'Mist, das Kabel zum Amt ist verstopft …'`; Doppelklick auf Absenden erzeugt genau **einen** Eintrag.
- [ ] **Step 4: Commit**

```bash
git add config.js app.js
git commit -m "feat: echter geteilter Feed über Supabase (laden, posten, Fehlerpfade)"
```

---

### Task 6: Karten-Sidebar (Pins, Popups, sticky, mobil einklappbar)

**Files:**
- Modify: `app.js`, `index.html` (Leaflet-Script-Tag existiert schon), `style.css`

**Interfaces:**
- Consumes: `state.meldungen`, `istGueltigeKoordinate`, `formatNummer/formatDatum/escapeHtml`.
- Produces: `initialisiereKarte()`, `renderKarte()`; Pin-Factory `pinIcon(art) -> L.divIcon` (Tropfenform 24 px, rot `V` / grün `G`, Optik aus Mockup); `#mapSidebar` initialisiert auf Deutschland-Mitte `[51.163, 10.447]`, Zoom 6, `scrollWheelZoom: false`, Zoom-Buttons; Attribution bleibt. Nur Meldungen mit `istGueltigeKoordinate(lat,lng)` bekommen Marker; `radius_m > 0` → `L.circle` (gleiche Farbe, `fillOpacity 0.12`). Popup: Badge, Text (≤ 120 Zeichen), `Nr.`, Name, Datum + Link `Zur Meldung ↓` (`href="#meldung-<id>"`, Klick hebt Karte 2 s hervor). `#mapToggle` klappt `#mapBox` mobil ein/aus (Text: `🗺️ Karte anzeigen (n)` / `🗺️ Karte verbergen`).

- [ ] **Step 1: Karte bauen** — Leaflet init nach `renderFeed()` in `init()`; `renderKarte()` bei jedem Neu-Rendern aufrufen (Marker-Layer vorher `clearLayers`).
- [ ] **Step 2: Verifizieren** — Server + Seite; Expected: 4 Pins (rot/grün korrekt), Popups öffnen, Jonas-Zeile zeigt grünen Kreis (Seeds: `radius_m 300`), „Zur Meldung ↓" springt zur richtigen Karte in der Liste, Scrollen lässt die Karte stehen (sticky), Fenster < 860 px → Karte klappt ein/aus, Console sauber, Attribution sichtbar.
- [ ] **Step 3: Commit**

```bash
git add app.js index.html style.css
git commit -m "feat: Karten-Sidebar mit Pins, Bereichs-Kreisen, Popups und Mobil-Einklappen"
```

---

### Task 7: Standort im Formular (Punkt / Bereich)

**Files:**
- Modify: `app.js`, `style.css`

**Interfaces:**
- Consumes: `#standortBlock` (Bereich „Standort (optional)" im Composer), `#mapMini`, `#btnPunkt`, `#btnBereich`, `#radius`, `#radiusVal`.
- Produces: Composer-State `standort = { lat, lng, radius_m } | null` (Start `null`); Klick in `#mapMini` setzt/verschiebt Pin (draggable, `pinIcon('verloren')` — Formular-Pin bleibt rot), Punkt-Modus: `radius_m = null`, Bereich: Radius aus Slider (50–1000, Default 300) mit `L.circle` live; Modus-Pills optisch wie im Mockup (gelb aktiv). `postMeldung` sendet `lat`/`lng` nur wenn `standort !== null`, sonst beide `null`; `radius_m` entsprechend. Nach erfolgreichem Posten: `standort = null`, Modus zurück auf „Bereich", Marker vorbelegt auf Deutschland-Default.

- [ ] **Step 1: Mini-Karte + Modus-Pills implementieren** — zweite Leaflet-Instanz (`scrollWheelZoom: false`), Click + drag synchronisieren Marker/Kreis; Moduswechsel blendet Kreis/Radius-Regler aus (Punkt) bzw. ein (Bereich).
- [ ] **Step 2: Verifizieren** — Expected: Klick setzt Pin, Ziehen verschiebt ihn, „🎯 Genauer Punkt" versteckt Kreis + Regler, „⭕ Bereich" zeigt beides, Regler ändert Kreis + Anzeige („ca. 300 m") live; Posten mit Standort → Pin erscheint auf der Sidebar-Karte (bei Bereich mit Kreis); Posten ohne Klick → kein Marker; nach Posten ist das Formular zurückgesetzt.
- [ ] **Step 3: Commit**

```bash
git add app.js style.css
git commit -m "feat: Standort im Formular (genauer Punkt oder Bereich) mit Mini-Karte"
```

---

### Task 8: Rechtliches & Feinschliff

**Files:**
- Create: `impressum.html`, `datenschutz.html`
- Modify: `index.html` (Favicon-Link, Meta-Description, Leerzustände), `style.css` ggf.

**Interfaces:**
- Consumes: `style.css` (gleicher Look), Footer-Links.
- Produces: Rechtsseiten mit klar markierten Platzhaltern `<!-- AUSFÜLLEN -->` (Betreiberangaben, Datenschutz-Kurzfassung: gespeichert werden nur freiwillige Angaben; Standort optional; „Bereich" schützt den genauen Ort; keine Cookies durch uns). Karten-Leerzustand: `'Noch keine Pins — sei die erste Nadel im Heuhaufen!'`. Favicon verlinkt.

- [ ] **Step 1: Seiten + Politur bauen** — Layout wie index (Header schlank, Ticker optional, Inhalt, Footer), Links untereinander via `impressum.html`/`datenschutz.html`.
- [ ] **Step 2: Verifizieren** — Beide Seiten laden im Look; Footer-Links funktionieren von und zu index; Favicon erscheint; leere Liste zeigt Lupe-Spruch; leere Karte ihren Satz; `docs/test-checklist.md` einmal komplett durchgehen und abhaken.
- [ ] **Step 3: Commit**

```bash
git add impressum.html datenschutz.html index.html style.css
git commit -m "feat: Impressum/Datenschutz (Platzhalter), Favicon und Leerzustände"
```

---

### Task 9: Deployment auf GitHub Pages

**Files:**
- Create: `README.md`
- Modify: keine (nur Remote/Pages)

**Interfaces:**
- Consumes: fertige Seite aus Task 1–8.
- Produces: öffentliche URL `https://<user>.github.io/Digitales-Fundbuero/`.

- [ ] **Step 1: `README.md` schreiben** — Kurzbeschreibung, Dev-Anleitung (`node dev-server.js`), Supabase-Setup-Verweis (`docs/supabase-setup.sql`, `config.js`), Deployment-Hinweis, Test-Checkliste-Verweis.
- [ ] **Step 2: Repository anlegen & pushen** — Repo `Digitales-Fundbuero` beim Betreiber-Account anlegen (bitmancer); `git remote add origin` + `git push -u origin main`.
- [ ] **Step 3: GitHub Pages aktivieren** — Settings → Pages → „Deploy from a branch": `main` / `/ (root)`.
- [ ] **Step 4: Live-Check** — URL öffnen: Feed lädt echte Daten, Posten funktioniert (Testeintrag „von Fundbüro" danach im Dashboard löschen), Karte + Pins ok, Reload ok, `docs/test-checklist.md` bestanden.
- [ ] **Step 5: Commit (falls README noch offen)**

```bash
git add README.md
git commit -m "docs: README mit Setup, Dev-Server und Deployment"
```

---

## Bewusst NICHT im Scope (späterer Stretch)

- „📍 Bei mir"-Geolocation-Button, Supabase-Realtime-Push, „Belohnung"-Tag, Clustering bei vielen Pins, eigene OSM-Retro-Kacheln, Captcha/Spam-Filter.
