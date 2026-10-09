# Digitales Fundbüro

Statische Y2K-Webseite, auf der Fundbüro-Meldungen („Verloren“ / „Gefunden“) öffentlich gepostet und im Feed oder auf einer Karte angezeigt werden. Vanilla JS ohne Build-Schritt, Supabase (REST) als Datenbank, Leaflet/OpenStreetMap für die Karte.

- Feed mit Filtern `Alle · Verloren · Gefunden` und sticky Karten-Sidebar (mobil einklappbar via „🗺️ Karte anzeigen")
- Posten-Formular mit optionalem Standort (genauer Punkt oder Bereich) und Bildschirmtastatur
- Karte mit farbigen Pins und Bereichs-Kreisen (Leaflet/OSM)
- Impressum, Datenschutz-Minimum und Fundpflicht-Disclaimer

## Lokal entwickeln

Voraussetzung: Node.js (keine weiteren Dependencies).

```bash
node dev-server.js
```

Danach <http://localhost:8080> im Browser öffnen.

## Supabase einrichten

1. Projekt im [Supabase-Dashboard](https://supabase.com/dashboard) anlegen.
2. `docs/supabase-setup.sql` im SQL-Editor des Projekts ausführen.
3. Project-URL und Publishable/anon Key in `config.js` eintragen (`supabaseUrl`, `supabaseAnonKey`).

Hinweise:

- Der Publishable/anon Key darf öffentlich sein — der Zugriff wird durch Row Level Security (RLS) geschützt.
- `service_role`-/Secret Key **niemals** ins Repository committen.
- Bleiben die Werte in `config.js` leer, zeigt die Seite „Das Amt ist noch nicht angeschlossen …“ statt abzustürzen.

## Deployment (GitHub Pages)

- Repository `Digitales-Fundbuero` beim Betreiber-Account anlegen und Branch `main` pushen.
- Settings → Pages → „Deploy from a branch“: Branch `main`, Ordner `/ (root)`.
- Die Seite wird **bewusst nicht indexiert**: `robots.txt` verbietet Crawlern den Zugriff, zusätzlich steht `<meta name="robots" content="noindex, nofollow">` in `index.html`.

## Tests & Checks

```bash
node --test tests/logic.test.js
```

- Manuelle Checkliste vor jedem „fertig“: `docs/test-checklist.md`
- Design-Referenzen/Mockups: `docs/design-references/`
