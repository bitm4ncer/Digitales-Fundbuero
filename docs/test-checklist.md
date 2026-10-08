# Manuelle Test-Checkliste — Digitales Fundbüro

Stand: 2026-10-09 · vor jedem „fertig" einmal durchgehen (Desktop 1280px+, zuletzt kurz Mobil checken).

## Feed & Ansichten
- [ ] Feed lädt beim Öffnen, neueste Meldung oben, Datum im Format TT.MM.JJJJ
- [ ] Karten zeigen Badge (rot/grün), `Nr.`, Name (leer → „Anonym"), Text ggf. gekürzt
- [ ] `NEU!`-Sternchen nur bei Meldungen der letzten 24 h
- [ ] Filter `Alle · Verloren · Gefunden` filtert Liste **und** Karte
- [ ] Umschalter `📋 Liste | 🗺️ Karte` wechselt sauber; „Aktualisieren" lädt neu
- [ ] Leerzustand: Lupe + Spruch („Ich habe noch nichts gefunden …")

## Posten
- [ ] Typ-Pills: „Verloren" vorausgewählt, umschaltbar
- [ ] Zeichenzähler zählt mit (x/500); Absenden mit < 3 Zeichen zeigt Meldung
- [ ] Name/Kontakt optional; leere Felder werden zu `null`
- [ ] Standort optional: ohne Kartenklick wird ohne lat/lng gesendet
- [ ] Punkt vs. Bereich: Kreis erscheint/verschwindet, Regler verändert Radius live
- [ ] Absenden: Button sperrt während Senden; Erfolg → Bestätigung, Formular leer, Feed + Karte aktuell
- [ ] Fehlerfall (offline/Bad key): freundliche Fehlermeldung, Formularinhalt bleibt erhalten
- [ ] `config.js` leer → Hinweis „Das Amt ist noch nicht angeschlossen…" statt Absturz

## Karte
- [ ] Pins korrekt in Farbe/Buchstabe (V rot, G grün), Popup mit Nummer/Typ/Text/Datum
- [ ] Bereichs-Meldungen zeigen transparenten Kreis mit passendem Radius
- [ ] Attribution „© OpenStreetMap-Mitwirkende" sichtbar
- [ ] Deutschland-Default beim ersten Öffnen, Zoom per +/−, kein Scroll-Zoom
- [ ] „Zur Meldung ↓" springt zur richtigen Karte in der Liste

## Tastatur
- [ ] A–Z, 0–9, Ä Ö Ü ß, . , ? !, LEERTASTE, ⌫ — Einfügen an Cursorposition
- [ ] Auswahl im Textfeld wird durch Klick-Taste ersetzt; ⌫ löscht das Zeichen davor
- [ ] Fokus bleibt im Textfeld; physische Tastatur tippt normal
- [ ] Gedrückte Taste: Inset-Optik sichtbar

## Optik & Robustheit
- [ ] Vergleich neben Mockup (`docs/design-references/brand-jamba-nummer.html`)
- [ ] Lange Texte brechen um, nichts läuft über (kein horizontaler Scrollbalken)
- [ ] Sehr kleine Fenster (Mobil): Grundfunktion ok, Tastatur scrollt
- [ ] Nachtrag: Impressum/Datenschutz verlinkt und befüllt (⚠️ vor öffentlichem Launch)
