# Digitales Fundbüro — Upvotes („Beliebt") — Design-Spec

**Datum:** 2026-10-09
**Status:** Entwurf zur Abnahme
**Projekt:** Digitales Fundbüro · **Feature:** Upvotes ohne Accounts, ohne Cookies
**Grundlage:** Brainstorming 2026-10-09 — gewählter Ansatz A (Zähler-Spalte + Stimmen-Tabelle + Toggle-RPC)

---

## 1. Ziel & Erfolgskriterien

Besucher können Meldungen „hochstimmen" (▲) — wie bei Hacker News, aber ohne Konten:

- **F1** Ein Klick auf „▲" gibt eine Stimme; nochmal klicken **nimmt sie zurück** (Toggle).
- **F2** Die Karte zeigt den Stimmen-Zähler; die Sortierung **„🏆 Beliebt"** (Toggle neben den Filtern, Standard bleibt **„Neu"**) ordnet nach Stimmen, Gleichstand nach Neueste.
- **F3** Ohne Cookies, ohne Fingerprinting, kein localStorage: Mehrfachstimmen blockt der Server über eine **gehashte IP-Kennung** (ein Hash pro Meldung+IP, Unique-Constraint).
- **F4** Missbrauch gebremst: Sperrliste + Drossel (Default 60 Aktionen/Stunde/IP-Hash). Der Zähler kann nicht driften (DB-Trigger).
- **F5** Graceful Degradation: Fehlt die SQL-Migration, lädt der Feed normal — die Vote-UI erscheint einfach **nicht** (gleiches Muster wie die Kontakt-Spalten).
- **F6** F5 (Reload) nach einem Vote zeigt denselben Zustand (Server ist Quelle der Wahrheit).

**Nicht-Ziele (YAGNI):** keine Downvotes, kein Zeitverfall-Ranking, keine Accounts, keine Vote-Anzeige in Karten-Popups (ggf. später), keine Client-Speicherung des Vote-Zustands (kommt vom Server).

---

## 2. Nutzer-Flows

1. **Upvoten:** Klick auf „▲ N" → Button geht sofort in den gedrückten Zustand (+1, optimistisch, Doppelklick gesperrt) → RPC bestätigt `{stimmen, gestimmt}` oder **rollt zurück** + kurze Meldung im Status-Banner.
2. **Unvote:** gleicher Klick, Toggle serverseitig.
3. **Sortieren:** Pill „🏆 Beliebt" togglet `state.sort`; der Feed lädt mit `order=stimmen.desc,id.desc` neu. Filter (Alle/Verloren/…) und Sortierung kombinieren sich; „Aktualisieren" behält die Sortierung.
4. **Drossel/Sperre:** freundliche Fehlermeldung („Zu viele Stimmen in kurzer Zeit …" / „Diese Anfrage wurde gesperrt."), Zustand bleibt konsistent (Rollback).

---

## 3. Datenmodell & Server-API (SQL-Abschnitt 6)

Angehängt an `docs/supabase-setup.sql` (idempotent wie der Rest). Muster identisch zu `nachricht_senden`: IP serverseitig aus den Request-Headern, `md5('fundbuero|' || ip)`, Sperrliste, Drossel, `security definer`.

```sql
-- 6) Stimmen (Upvotes) -------------------------------------------------------
create table if not exists stimmen (
  id         bigint generated always as identity primary key,
  meldung_id bigint not null references meldungen(id) on delete cascade,
  ip_hash    text not null,
  created_at timestamptz not null default now(),
  unique (meldung_id, ip_hash)
);
create index if not exists stimmen_meldung_idx on stimmen (meldung_id);
create index if not exists stimmen_ip_idx on stimmen (ip_hash);
alter table stimmen enable row level security;
-- bewusst KEINE Policies: nur die Funktionen unten (SECURITY DEFINER) kommen ran.

-- Kurzes Protokoll nur für die Drossel; wird automatisch wieder aufgeräumt.
create table if not exists stimmen_log (
  id         bigint generated always as identity primary key,
  ip_hash    text not null,
  created_at timestamptz not null default now()
);
create index if not exists stimmen_log_ip_idx on stimmen_log (ip_hash, created_at);
alter table stimmen_log enable row level security;

-- Denormalisierter Zähler auf meldungen, per Trigger gepflegt (kann nicht driften).
alter table meldungen add column if not exists stimmen int not null default 0;

create or replace function pflege_stimmenzahl()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update meldungen set stimmen = stimmen + 1 where id = new.meldung_id;
  elsif tg_op = 'DELETE' then
    update meldungen set stimmen = greatest(stimmen - 1, 0) where id = old.meldung_id;
  end if;
  return null;
end; $$;

drop trigger if exists stimmen_hoch on stimmen;
create trigger stimmen_hoch after insert on stimmen
  for each row execute function pflege_stimmenzahl();
drop trigger if exists stimmen_runter on stimmen;
create trigger stimmen_runter after delete on stimmen
  for each row execute function pflege_stimmenzahl();

-- Öffentlicher Lesezugriff NUR auf den Zähler (Spalten-Grant erweitern!).
grant select (id, created_at, art, text, name, lat, lng, radius_m,
              kontakt, kontakt_modus, postfach_pubkey, laeuft_ab_am, stimmen)
  on table public.meldungen to anon;

-- Stimme abgeben/umschalten (race-safe über den Unique-Constraint).
create or replace function meldung_stimme(p_meldung_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_ip text; v_hash text; v_count int; v_da boolean; v_zahl int;
begin
  if not exists (select 1 from meldungen
                 where id = p_meldung_id
                   and (laeuft_ab_am is null or laeuft_ab_am > now())) then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Meldung gibt es nicht (mehr).');
  end if;

  v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
  v_ip := trim(split_part(v_ip, ',', 1));
  v_hash := md5('fundbuero|' || v_ip);

  if exists (select 1 from sperren where wert = v_hash) then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Anfrage wurde gesperrt.');
  end if;

  select count(*) into v_count from stimmen_log
    where ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_count >= 60 then
    return jsonb_build_object('ok', false, 'fehler', 'Zu viele Stimmen in kurzer Zeit — versuch es später nochmal.');
  end if;

  insert into stimmen_log (ip_hash) values (v_hash);
  delete from stimmen_log where created_at < now() - interval '48 hours';

  select exists (select 1 from stimmen
                 where meldung_id = p_meldung_id and ip_hash = v_hash) into v_da;
  if v_da then
    delete from stimmen where meldung_id = p_meldung_id and ip_hash = v_hash;
  else
    begin
      insert into stimmen (meldung_id, ip_hash) values (p_meldung_id, v_hash);
    exception when unique_violation then
      null; -- Parallel-Klick: schon vorhanden → als „gestimmt" behandeln
    end;
  end if;

  select m.stimmen into v_zahl from meldungen m where m.id = p_meldung_id;
  select exists (select 1 from stimmen
                 where meldung_id = p_meldung_id and ip_hash = v_hash) into v_da;
  return jsonb_build_object('ok', true, 'stimmen', coalesce(v_zahl, 0), 'gestimmt', v_da);
end; $$;

-- Eigene Stimmen (Button-Zustand beim Laden) — gleiche IP-Ableitung.
create or replace function meine_stimmen()
returns table (meldung_id bigint)
language sql security definer set search_path = public as $$
  select s.meldung_id from stimmen s
  where s.ip_hash = md5('fundbuero|' || trim(split_part(
    coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1)));
$$;
```

**RPC-Verträge:**

| RPC | Request | Antwort |
|---|---|---|
| `POST /rest/v1/rpc/meldung_stimme` | `{ "p_meldung_id": <id> }` | `{ ok: true, stimmen: n, gestimmt: bool }` oder `{ ok: false, fehler: "…" }` |
| `POST /rest/v1/rpc/meine_stimmen` | `{}` | `[ { meldung_id: n }, … ]` |

**Bewusste Festlegungen:**
- Drosselwert **60 Aktionen/Stunde** und Protokoll-Aufbewahrung **48 h** sind Startwerte, im SQL leicht änderbar.
- NAT-Trade-off: Mehrere Personen hinter einer IP teilen sich eine Stimme (dokumentiert im Datenschutz).
- Votes auf abgelaufene Beiträge sind serverseitig gesperrt (Existenz-Check inkl. `laeuft_ab_am`).
- Meldung löschen entfernt Stimmen per `ON DELETE CASCADE`; der Zähler verschwindet mit der Zeile.

---

## 4. Client (app.js, style.css, index.html)

- **State:** `state.sort = 'neu' | 'beliebt'`, `state.stimmenAktiv = bool`, `state.eigeneStimmen = {}` (Objekt als Set).
- **Laden:** neue Feldliste `FELDER_STIMMEN = FELDER_KONTAKT + ',stimmen'`; Fallback-Kette dreistufig (Stimmen → Kontakt → Basis). Bei 400 in Stufe 1/2: `state.stimmenAktiv = false`, Vote-UI bleibt aus. `holeMeldungen(felder, order)`; „Neu" = `id.desc`, „Beliebt" = `stimmen.desc,id.desc`.
- **`meine_stimmen`:** nach erfolgreichem Laden einmal abrufen (nur wenn `stimmenAktiv`); Ergebnis als `state.eigeneStimmen` markieren, Buttons gedrückt darstellen. Fehler → alle Buttons ungedrückt (unkritisch).
- **Feed-Karte:** glossy „▲ N"-Pill rechts neben/über „Antworten"; `aria-pressed`, aussagekräftiges `aria-label` („Stimme für Meldung Nr. …"). Während des Requests deaktiviert. Optimistisches Update; bei Fehler Rollback + Meldung im bestehenden Status-Banner (`#statusHinweis`).
- **Sortier-Pill:** `🏆 Beliebt` in der Filterzeile als Toggle (`aria-pressed`, `pillAktiv`-Optik). Klick lädt mit neuer Sortierung neu.
- **Umami:** nach erfolgreichem Hochzählen (nicht beim Zurücknehmen): `umami.track('stimme-abgegeben')` — gleiches Guard-Muster wie `meldung-gesendet`.
- **Versionen:** `style.css` und `app.js` von v9 auf v10 hochzählen (Cache-Mixe vermeiden).
- Optik/Icon (Aufwärts-Pfeil im farbigen SVG-Stil; Größe/Farben der Pill) werden beim Bau mit `frontend-design` finalisiert — Panel-frei, aber konsistent zum Y2K-Look (glossy Pill, Inset „gedrückt").

---

## 5. Datenschutz (datenschutz.html)

Neuer Absatz zwischen „Standort" und „Cookies und Reichweitenmessung":

> **Stimmen (▲)** — Stimmen kannst du ohne Konto und ohne Cookies abgeben; pro Meldung zählt eine. Dafür speichern wir eine **gehashte IP-Kennung** (kein Klartext) und den Zeitpunkt. Mehrere Personen hinter derselben IP (z. B. im selben WLAN) teilen sich eine Stimme; eine abgegebene Stimme kannst du jederzeit zurücknehmen. Zur Missbrauchsabwehr (Drosselung, ggf. Sperrung) führen wir ein kurzes Protokoll aus gehashter IP-Kennung und Zeitpunkt, das automatisch nach kurzer Zeit gelöscht wird.

---

## 6. Fehler- & Degradationsfälle

| Fall | Verhalten |
|---|---|
| Migration fehlt (Spalte `stimmen` → 400) | Feed lädt über Fallback-Kette; Vote-UI aus; „Beliebt" ausgeblendet/deaktiviert |
| RPC-Fehler (Netz, 4xx/5xx) | Rollback der optimistischen Änderung + Meldung im Status-Banner |
| Drossel/Sperre | `{ok:false, fehler}` → Rollback + freundliche Meldung |
| Doppelklick / parallele Tabs | Button gesperrt; Unique-Constraint + `unique_violation`-Catch serverseitig |
| Abgelaufene Meldung | server-seitig abgelehnt; UI verschwindet ohnehin mit dem Feed-Refresh |

---

## 7. Testplan

**SQL (im Supabase-Editor, nach Migration):**
- Toggle: 1. Aufruf `{stimmen:1, gestimmt:true}` → 2. Aufruf `{stimmen:0, gestimmt:false}` → 3. Aufruf wieder `1/true`.
- Zähler-Drift: direktes `insert`/`delete` in `stimmen` → `meldungen.stimmen` folgt.
- Drossel: >60 Aufrufe/Stunde → Fehlerantwort; Sperrliste: `sperren`-Eintrag des Test-Hashes → gesperrt.
- `meine_stimmen` liefert die eigene Meldungs-ID; `anon` kann `stimmen`-Tabelle **nicht** lesen.

**Browser (lokal, gegen echte Supabase):**
- Vote + Reload → Zustand konsistent; Unvote; „Beliebt" sortiert korrekt (mit Filter kombiniert); Netzfehler simulieren → Rollback sichtbar.
- A11y: Tastaturbedienung, `aria-pressed` wechselt; Mobil-Layout ok.
- Umami: `stimme-abgegeben` feuert (Stub-Check wie beim `meldung-gesendet`-Test); auf localhost weiterhin kein Send.

**Hinweis:** Test-Klicks erzeugen echte Votes (gleiche Datenbank) — einfach per Toggle wieder zurücknehmen.

**Checkliste:** `docs/test-checklist.md` bekommt einen Abschnitt „Stimmen".

---

## 8. Umsetzung & Koordination

- Wegen der parallel arbeitenden Agenten: Umsetzung im **Git-Worktree** auf Branch `feature/upvotes`; Merge erst nach Abnahme der Ergebnisse.
- Reihenfolge: SQL-Abschnitt 6 → App (app.js/style.css/index.html/icons.js) → Datenschutz + Doku → Verifikation.
- Die SQL-Migration führt der Betreiber im Supabase-Dashboard aus (wie beim bisherigen Setup; Abschnitt 6 ist wiederholbar).
- Kollisionsflächen mit anderen Agenten: `app.js`, `style.css`, `index.html`, `icons.js`, `docs/supabase-setup.sql` — im Worktree isoliert.

---

## 9. Entscheidungen & offene Punkte

**Entschieden (Brainstorming 2026-10-09):**
1. Wirkung: Zähler + Sortierung „Beliebt" (kein Zeitverfall-Ranking).
2. Stimme umschaltbar (Toggle), ein RPC, idempotent/race-safe.
3. Anti-Abuse: gehashte IP (server-seitig), keine Cookies, kein localStorage, kein Fingerprinting.
4. Ansatz A (Zähler-Spalte + Trigger + Stimmen-Tabelle) statt View/COUNT.

**Offen (beim Bau):**
- Optische Feinheiten (Pfeil-Icon, Pill-Farben/-Größe) mit `frontend-design`.
- Drosselwert/Aufbewahrung final bestätigen (Startwerte 60/h, 48 h).

## 10. Referenz

- Bestehende Design-Spec: `docs/superpowers/specs/2026-10-09-digitales-fundbuero-design.md`
- SQL-Setup: `docs/supabase-setup.sql` (bestehende Muster: `nachricht_senden`, `sperren`)
