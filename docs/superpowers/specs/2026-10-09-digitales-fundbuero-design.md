# Digitales Fundbüro — Design-Spec

**Datum:** 2026-10-09
**Status:** Entwurf zur Abnahme
**Projekt:** Digitales Fundbüro — öffentliches schwarzes Brett für Verlorenes & Gefundenes
**Hosting:** GitHub Pages (statisch) · **Daten:** Supabase (Postgres) · **Karte:** OpenStreetMap via Leaflet

---

## 1. Ziel & Vision

Eine bewusst „frühe 2000er"-Webseite: **Jamba-Energie (2006) trifft Bürgerbüro-Charme (2003)** — aber als eigenständige Marke „**Digitales Fundbüro**", ohne Städte-/Amts-Branding.

- Besucher können **melden, was sie verloren oder gefunden haben**.
- Alle Besucher sehen **denselben geteilten Feed** (echte Pinnwand, keine Demo).
- Jede Meldung *kann* eine **Standort-Angabe** haben (genauer Punkt **oder** Bereich) und erscheint dann auf einer **OpenStreetMap-Karte**.
- Kein Login, keine Accounts für Besucher. Name & Kontakt sind freiwillig.
- Tonalität: **Du**, humorvoll, mit kleinen Späßen (Besucherzähler, Kleingedrucktes).

**Erfolgskriterien:**
1. Eine fremde Person kann in unter 60 Sekunden eine Meldung posten und sieht sie sofort im Feed.
2. Die Karte zeigt alle Meldungen mit Standort; Punkt vs. Bereich ist erkennbar.
3. Alles läuft kostenlos auf GitHub Pages + Supabase Free Tier, ohne Serverbetrieb.
4. Optik entspricht den abgenommenen Mockups (Referenz: `docs/design-references/`).

---

## 2. Look & Feel (abgenommen)

Referenz-Mockups (statisch, im Repo):
- `docs/design-references/brand-jamba-nummer.html` — finaler Look der Seite (Wortmarke, Karten, Tastatur, Nummern)
- `docs/design-references/sidebar.html` — finales Desktop-Layout (Feed + sticky Karten-Sidebar, Mobil-Skizze)
- `docs/design-references/karte.html` — Karten-Details (Pins, Popups, Punkt/Bereich-Auswahl)

**Stil:**
- **Stadtblau-Palette:** Tiefblau `#1a3e6e`, Aktion `#2a68c4`, Verläufe `#4b8de0→#1d5eb8→#164a96`; Akzent **Gelb `#ffd200`**, Ticker `#ffd200→#f7b400`.
- **Typografie:** System-Fonts. Wortmarke in `'Arial Rounded MT Bold', 'Arial Black'` (900, italic), Fließtext Arial.
- **Bausteine:** Riesen-Wortmarke `DIGITALES` / `FUNDBÜRO` mit „DAS ORIGINAL! ★"-Sticker; gelber Ticker; glossy Pill-Buttons; Feed-Karten mit runden VERLOREN (rot) / GEFUNDEN (grün) Badges; Kraftausdruck-CTA „JETZT EINTRAGEN!".
- **Maskottchen:** „Lupe" (SVG: Lupe mit Gesicht). Sprechblase: „**Hi, ich bin Fundbüro!**" Die Lupe *ist* die Stimme des Fundbüros (auch im Leerzustand der Liste).
- **Tastatur:** 4 Reihen aus der Skizze (A–Z, 0–9) + Sonder-Reihe: **Ä Ö Ü ß** (gelb), **. , ? !** (grau), **⌫** (rot) + breite **LEERTASTE**. Anklickbar; gedrückter Zustand mit Inset-Schatten.
- **Karten-Fenster (Sidebar):** blaue Leiste „🗺️ Karte der Fundstücke" mit Pin-Zähler, Legende unten. Desktop: **sticky Sidebar rechts** neben dem Feed; Mobil: einklappbares Panel oben (Button „🗺️ Karte anzeigen"). Kartenkacheln mit warmem Retro-Filter (`saturate(.9) sepia(.12)`). Referenz: `docs/design-references/sidebar.html`.
- **Pins:** Tropfenform, rotes „V" (Verloren) / grünes „G" (Gefunden); Popup mit Nummer, Typ, Kurztext, Zeit.
- **Footer:** „© 2003–2026 Digitales Fundbüro · Impressum · Datenschutz · Du bist Besucher Nr. 0044711" (Zähler dekorativ).

---

## 3. Nutzer-Flows

### 3.1 Lesen
1. Seite öffnet → Kopf mit Marke + Lupe, Ticker, Filter `Alle · Verloren · Gefunden`, Feed links (neueste zuerst).
2. Rechts das Kartenfenster (**sticky Sidebar**): alle (gefilterten) Meldungen mit Standort als Pins; Klick → Popup. Mobil klappt die Karte als Panel oben ein/aus.
3. „🔄 Aktualisieren" lädt neu (kein Auto-Polling nötig; optionaler Stretch).

### 3.2 Posten
1. Formular: Typ (Verloren vorausgewählt / Gefunden), Text (Pflicht, 3–500 Zeichen), Name (optional, Default „Anonym"), Kontakt (optional), Standort (optional).
2. Standort: Mini-Karte; Klick setzt Pin (ziehbar); Umschalter **🎯 Genauer Punkt / ⭕ Bereich**; Bereich: Radius-Slider 50–1000 m (Default 300 m).
3. „JETZT EINTRAGEN!" → senden; Erfolg: Formular leert sich, Liste + Karte aktualisieren, kurz feiern. Fehler: Y2K-Meldung im Amtston.

---

## 4. Architektur

```
Besucher-Browser (GitHub Pages, statisch)
 ├─ index.html + style.css + app.js + logic.js + config.js
 ├─ Leaflet 1.9.4 (CDN unpkg) ── OSM-Tiles (tile.openstreetmap.org)
 └─ fetch() ──> Supabase REST (Postgres, RLS) ──> Tabelle `meldungen`
```

- **Kein Build-Step, kein Framework, kein npm** im Frontend (passt zum Y2K-Geist). Vanilla JS.
- **Supabase** dient als „Server": Tabelle + REST-API via anon key; RLS-Policies erlauben nur `select` + `insert`.
- **Leaflet** per CDN; OSM-Kacheln. Attribution „© OpenStreetMap-Mitwirkende" ist Pflicht und bleibt sichtbar.
- **config.js** hält `SUPABASE_URL` + `SUPABASE_ANON_KEY` (öffentlich, RLS schützt). Ist nichts konfiguriert → freundlicher Hinweis „Das Amt ist noch nicht angeschlossen…" statt Fehler.

### Dateistruktur
```
/index.html            Seite + alle Templates (Feed-Karte, Popup)
/style.css             Komplettes Styling (CSS-Variablen für Palette)
/app.js                DOM/UI, Fetch gegen Supabase, Leaflet-Setup
/logic.js              reine Logik (nummerieren, Tastatur-Einfügen, Validierung) – testbar
/config.js             Projekt-URL + anon key  (AUSFÜLLEN)
/impressum.html        einfache Seite im Look
/datenschutz.html      einfache Seite im Look
/assets/lupe.svg       Maskottchen
/tests/logic.test.js   Node-Tests (node --test)
/docs/design-references/  abgenommene Mockups
```

---

## 5. Datenmodell

```sql
create table meldungen (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  art        text not null check (art in ('verloren','gefunden')),
  text       text not null check (char_length(text) between 3 and 500),
  name       text          check (char_length(name) <= 60),
  kontakt    text          check (char_length(kontakt) <= 200),
  lat        double precision,
  lng        double precision,
  radius_m   integer check (radius_m is null or (radius_m >= 25 and radius_m <= 2000))
);
-- Standort-Regel: lat/lng NULL = kein Standort; radius_m NULL = genauer Punkt; radius_m > 0 = Bereich.

alter table meldungen enable row level security;
create policy "alle lesen"    on meldungen for select using (true);
create policy "alle melden"   on meldungen for insert with check (true);
```

- **Anzeige-Nummer:** `Nr. 2026-0042` = `Jahr(created_at) + id` (4-stellig, nullgepolstert). Nicht in der DB gespeichert.
- Löschen/Bearbeiten gibt es für Besucher nicht; der Betreiber räumt bei Bedarf im Supabase-Dashboard auf.
- **Optional: Seed-Daten** (3 Beispiel-Meldungen Mia/Jonas/Fundbüro) als separates SQL-Snippet im Repo (`docs/supabase-setup.sql`), damit der Feed nicht leer startet.

---

## 6. Funktionsdetails

**Feed-Liste:** neueste zuerst, max. 200 laden; die Feed-Karte zeigt: Badge, Text (bis ~220 Zeichen + „…"), `Nr.`, Name, Datum (TT.MM.JJJJ), `NEU!`-Sternchen bei den ersten 24 h.

**Filter & Aktualisieren:** Pills `Alle (n) · Verloren (n) · Gefunden (n)` mit Zählern — wirken auf Liste **und** Pins. Dazu „🔄 Aktualisieren".

**Composer:**
- Typ-Pills (Verloren aktiv per Default), Zeichenzähler „123/500", Validierung erst beim Absenden mit klarer Meldung.
- Senden-Schutz: Button deaktiviert während des Requests; Timeout-/Netzfehler → „Mist, das Kabel zum Amt ist verstopft. Nochmal versuchen?"
- Erfolgsfall: kurze Bestätigung („Eingetragen! Die Lupe macht sich auf die Suche. 🔍"), Reload.

**Tastatur (on-screen):**
- Fest im Formular verankert, **immer sichtbar** (nichts klappt weg) — mobil steht sie unter dem Feed im selben Formular.
- Klick auf Taste fügt an der Cursorposition des Textfelds ein (Auswahl ersetzt sie), `⌫` löscht davor, `LEERTASTE` fügt Leerzeichen ein; Fokus bleibt im Textfeld.
- Physische Tastatur funktioniert normal; Klick-Tasten tippen Kleinbuchstaben (kein Shift – bewusst simpel).
- Reine Logik (`insertFuerText`) lebt in `logic.js` und ist getestet.

**Karte:**
- Standard-Zentrum: Deutschland-Mitte, Zoom 6 (`[51.163, 10.447]`, z6); Zoom-Buttons, kein Scroll-Zoom (Doppelklick okay), Stretch: „📍 Bei mir"-Button mit Geolocation.
- Marker-Farbe/-Buchstabe nach `art`; Bereich-Meldungen zusätzlich als transparenter Kreis (`radius_m`).
- Popup: Badge, Text (kurz), `Nr.`, Name, Datum; Link „Zur Meldung ↓" springt zur Meldung in der Liste und hebt sie kurz hervor.
- Mockup-Kartenlink im Formular: nur nötig, wenn Nutzer einen Standort setzen will (Bereich `Standort (optional)`).

**Rechtliches/Privatsphäre:**
- `impressum.html` + `datenschutz.html` im gleichen Look, Inhalte als klar markierte Platzhalter (`<!-- AUSFÜLLEN -->`) — Betreiber haftet für die Texte. Hinweis in der Doku: öffentliche Seite mit Nutzerinhalten in DE kann Impressumspflicht auslösen.
- Datenschutz-Kurzfassung auf der Seite: gespeichert werden nur freiwillige Angaben; Standort optional; „Bereich" statt Punkt schützt den genauen Ort.

---

## 7. Deployment

**A) Supabase (einmalig, ~5 Minuten):**
1. Projekt anlegen (Free Tier) → Region Frankfurt.
2. SQL aus Abschnitt 5 im SQL-Editor ausführen (+ optional Seeds).
3. `Project URL` + `anon public key` kopieren → in `config.js` eintragen.
4. Faustregel: anon key darf öffentlich sein (RLS) — **service_role key niemals** ins Repo.

**B) GitHub Pages:**
1. Repo `Digitales-Fundbuero` (bitmancer) → Code pushen.
2. Settings → Pages → „Deploy from a branch": `main` / `/ (root)`.
3. URL: `https://bitmancer.github.io/Digitales-Fundbuero/` — testen: posten, Karte, Reload.

---

## 8. Testplan

**Automatisiert (node --test, keine Dependencies):**
- `formatNummer(id, createdAt)` → „2026-0042" (auch id < 1000, Jahreswechsel).
- `insertFuerText(text, start, ende, zeichen)` → Einfügen/Löschen/Ersetzen an Cursorposition, Grenzen.
- `validiereMeldung(...)` → Pflichtfeld, 3–500 Zeichen, Optionals werden getrimmt/`null`.

**Manuell (Checkliste im Repo unter docs/):**
- Feed lädt, Sortierung, Filter, „Aktualisieren".
- Posten inkl. Name/Kontakt/Standort (Punkt + Bereich), Zeichenzähler, Fehlerfälle (offline).
- Karte: Pins/Popups/Bereichs-Kreise, korrekte Farben, Attribution sichtbar.
- Tastatur: Einfügen an Cursorposition, ⌫, LEERTASTE, Umlaute; physische Eingabe.
- Optik: Referenz-Mockups daneben halten (Desktop 1280+); Basisfunktion auf Mobil (stapelt, Formular + Tastatur untereinander).
- Leerzustand (Lupe-Spruch), nicht-konfigurierte `config.js` (Hinweis), lange Texte.

---

## 9. Entscheidungen & offene Punkte

**Gesetzt (aus Brainstorming):**
- Supabase statt reinem localStorage; Hosting GitHub Pages; kein Login.
- Karte: OpenStreetMap/Leaflet, Standort optional, Punkt **oder** Bereich.
- Optik: Stadtblau + Gloss + Maskottchen (Variante 2) + Fundstück-Nummern.
- Tastatur mit Leertaste/Sonderzeichen; „du"-Ton.

**Annahmen (im Spec festgelegt, leicht änderbar):**
1. Karte als **sticky Sidebar rechts** (Desktop), Mobil als einklappbares Panel oben — festgelegt nach Mockup `sidebar.html`.
2. Filter-Pills statt separater Navi-Leiste (Start/Meldungen/… entfallen bewusst).
3. Beim Posten wird `name` leer → Anzeige „Anonym".
4. Kein Echtzeit-Push; „Aktualisieren"-Knopf + Auto-Reload nach dem Posten. (Supabase-Realtime wäre ein späterer Stretch.)
5. Besucherzähler bleibt dekorativ-statisch.

**Vom Betreiber zu erledigen:**
- Supabase-Account + Keys (Anleitung oben; ich führe durch).
- GitHub-Repo + Pages aktivieren.
- Impressum-/Datenschutz-Texte befüllen.

---

## 10. Referenz

- Abgenommene Mockups: `docs/design-references/` (brand-jamba-nummer.html, sidebar.html, karte.html)
- Setup-SQL: `docs/supabase-setup.sql` · Test-Checkliste: `docs/test-checklist.md`
- Brainstorm-Verlauf & Playback: lokal unter `.superpowers/brainstorm/` (per .gitignore ausgeschlossen)
