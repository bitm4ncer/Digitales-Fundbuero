# Digitales Fundbüro

> Schlüssel, Handy oder Herzensstück verloren? Meld es im Digitalen Fundbüro – kostenlos, anonym möglich, mit Karte. Gefundenes zurückgeben statt vergessen.

**🔗 Live:** <https://bitm4ncer.github.io/Digitales-Fundbuero/>

Statische Y2K-Webseite, auf der Fundbüro-Meldungen („Verloren“ / „Gefunden“) öffentlich gepostet und im Feed oder auf einer Karte angezeigt werden. Vanilla JS ohne Build-Schritt, Supabase (REST) als Datenbank, Leaflet/OpenStreetMap für die Karte.

- Feed mit Filtern `Alle · Verloren · Gefunden · Verschenken · Gesucht` und sticky Karten-Sidebar (mobil einklappbar via „🗺️ Karte anzeigen")
- Posten-Formular mit optionalem Standort (genauer Punkt oder Bereich, Ortssuche per OpenStreetMap/Nominatim) und Bildschirmtastatur
- Karte mit farbigen Pins und Bereichs-Kreisen (Leaflet/OSM)
- „✉️ Antworten" auf Meldungen: **offener Kontakt im Eintrag ODER anonymes Postfach** mit geheimem Link (aktive Wahl) — Postfach-Nachrichten sind **Ende-zu-Ende-verschlüsselt**, der Schlüssel steckt nur im privaten Link des Posters; optionales Ablaufdatum pro Beitrag
- ▲ **Upvotes & „Beliebt"-Sortierung**: eine Stimme pro Meldung, ohne Konto und ohne Cookies (gehashte IP-Kennung); Standard-Sortierung bleibt „Neu"
- Impressum, Datenschutz-Minimum und Fundpflicht-Disclaimer

## Lokal entwickeln

Voraussetzung: Node.js (keine weiteren Dependencies).

```bash
node dev-server.js
```

Danach <http://localhost:8080> im Browser öffnen.

## Supabase einrichten

1. Projekt im [Supabase-Dashboard](https://supabase.com/dashboard) anlegen.
2. `docs/supabase-setup.sql` im SQL-Editor des Projekts ausführen (wiederholbar; enthält Basistabelle, Kontakt-/Postfach-Setup und Stimmen/Upvotes).
3. Project-URL und Publishable/anon Key in `config.js` eintragen (`supabaseUrl`, `supabaseAnonKey`).

Hinweise:

- Der Publishable/anon Key darf öffentlich sein — der Zugriff wird durch Row Level Security (RLS) geschützt.
- `service_role`-/Secret Key **niemals** ins Repository committen.
- Bleiben die Werte in `config.js` leer, zeigt die Seite „Das Amt ist noch nicht angeschlossen …“ statt abzustürzen.

## Deployment (GitHub Pages)

- Repository `Digitales-Fundbuero` beim Betreiber-Account anlegen und Branch `main` pushen.
- Settings → Pages → „Deploy from a branch“: Branch `main`, Ordner `/ (root)`.
- Die öffentlichen Seiten sind **indexierbar** (`noindex`-Meta entfernt); `postfach.html` bleibt per `noindex` bewusst ausgeschlossen. `sitemap.xml` listet index/impressum/datenschutz — bitte einmalig in der Google Search Console einreichen. Hinweis: Bei GitHub-Projektseiten wird `robots.txt` nicht vom Host-Root ausgeliefert und daher von Suchmaschinen nicht gelesen — der eigentliche Hebel sind die Meta-Tags; die Datei bleibt der Vollständigkeit halber im Repo.

## Analytics (Umami, self-hosted)

- Self-hosted Umami unter `https://stats.bitmancer.net` · Website-ID `74c865dc-4cc3-4771-bb3f-c7bf7cf87c2a`
- Snippet liegt im `<head>` aller 4 HTML-Seiten: `defer` + `data-domains="bitm4ncer.github.io"` (lokal/Staging wird nie gezählt) + `data-do-not-track="true"` + `data-exclude-hash="true"` (der Postfach-Token im `#hash` bleibt aus der Messung draußen).
- Custom Events in `app.js`: `meldung-gesendet` (nach erfolgreichem Eintrag, inkl. Art der Meldung) und `stimme-abgegeben` (nur beim Hochzählen eines ▲) → Conversions im Dashboard sichtbar.
- Kurzfassung für Besucher: `datenschutz.html` → „Cookies und Reichweitenmessung".

## Tests & Checks

```bash
node --test tests/logic.test.js
```

- Manuelle Checkliste vor jedem „fertig“: `docs/test-checklist.md`
- Design-Referenzen/Mockups: `docs/design-references/`
