# Kontakt-Relay einrichten („✉️ Antworten") — ALTERNATIVE, derzeit nicht in Betrieb

> ⚠️ **Nicht mehr der aktive Weg.** Das Kontakt-System läuft jetzt über das
> **anonyme Postfach** (siehe `docs/supabase-setup.sql`, Abschnitt 4, und
> `postfach.html`). Diese Anleitung bleibt als Alternative erhalten, falls
> später doch E-Mail-Benachrichtigungen gewünscht sind.

Damit Antworten auf Meldungen per E-Mail beim Poster landen, ohne dass dessen
Kontaktdaten öffentlich werden. Einmalig, ca. 10 Minuten.

## 1. Datenbank (Supabase → SQL Editor)

Abschnitt **4) Kontakt-Relay** aus `docs/supabase-setup.sql` ausführen (der
Block ab `-- 4) Kontakt-Relay …`):

- legt die öffentliche Spalte `hat_kontakt` an (nur „ja/nein", nie die Adresse),
- sperrt die Spalte `kontakt` für den öffentlichen Lesezugriff,
- legt das private Protokoll `kontakt_anfragen` an (nur die Server-Funktion liest/schreibt es).

## 2. Brevo (Versanddienst)

1. Auf <https://www.brevo.com> mit „Sign up free" registrieren (kostenlos,
   300 Mails/Tag, keine Kreditkarte; neuer Account wird evtl. kurz geprüft).
2. **Absender verifizieren:** Settings → „Senders, Domains & Dedicated IPs" →
   `kontakt@jannesbecherer.de` hinzufügen → Bestätigungslink in der Mail klicken.
3. **API-Key erstellen:** Settings → „SMTP & API" → Tab **API Keys** →
   „Create a new API key" → Key kopieren (nur einmal sichtbar!).

## 3. Edge Function (Supabase → Edge Functions)

1. „Create a new function" → Name **`kontakt-relay`**.
2. Den Inhalt von `supabase/functions/kontakt-relay/index.ts` hineinkopieren.
3. **JWT-Prüfung deaktivieren** („Verify JWT" ausschalten) — die neuen
   Publishable Keys sind keine JWTs; sonst weist das Gateway alle Aufrufe ab.
4. Deployen.

## 4. Secrets setzen (Edge Functions → Secrets)

| Secret | Wert |
|---|---|
| `BREVO_API_KEY` | der Key aus Schritt 2.3 |
| `MAIL_FROM` | `kontakt@jannesbecherer.de` (verifizierter Absender) |
| `MAIL_FROM_NAME` | `Digitales Fundbüro` |
| `IP_HASH_SALT` | beliebiger Zufalls-String, z. B. 32 Zeichen |

`SUPABASE_URL` und `SUPABASE_SERVICE_ROLE_KEY` setzt Supabase automatisch —
beide werden **nur** serverseitig in der Function verwendet und stehen nie im Repo.

## 5. Testen

1. Auf der Seite eine Meldung **mit Kontakt** eintragen.
2. Auf der Karte „✉️ Antworten" klicken, Formular ausfüllen, absenden.
3. Erwartung: Erfolgsmeldung; die Mail kommt im Postfach des Posters an
   (Absender: `kontakt@jannesbecherer.de`, „Antworten" geht direkt an dich).

Grenzen & Schutz: max. 3 Anfragen/Stunde pro IP (gehasht protokolliert),
Honigtopf-Feld gegen Bots, Längen­limits wie im Formular. Logs:
Edge Functions → `kontakt-relay` → Logs.
