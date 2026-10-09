-- Digitales Fundbüro — Supabase Setup
-- Ausführen im Supabase SQL-Editor (einmalig, in dieser Reihenfolge).

-- 1) Tabelle ---------------------------------------------------------------
create table if not exists meldungen (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  art        text not null check (art in ('verloren','gefunden','verschenken')),
  text       text not null check (char_length(text) between 3 and 500),
  name       text          check (char_length(name) <= 60),
  kontakt    text          check (char_length(kontakt) <= 200),
  lat        double precision,
  lng        double precision,
  radius_m   integer check (radius_m is null or (radius_m >= 25 and radius_m <= 2000))
);
-- Regel: lat/lng NULL = kein Standort; radius_m NULL = genauer Punkt; radius_m > 0 = Bereich.

-- 2) Zugriffsregeln ---------------------------------------------------------
alter table meldungen enable row level security;

drop policy if exists "alle lesen" on meldungen;
create policy "alle lesen"  on meldungen for select using (true);

drop policy if exists "alle melden" on meldungen;
create policy "alle melden" on meldungen for insert with check (true);

-- 3) Optional: Seed-Daten ---------------------------------------------------
-- (Jederzeit im Dashboard löschbar; Koordinaten = München-Innenstadt)
insert into meldungen (art, text, name, kontakt, lat, lng, radius_m) values
  ('verloren', 'Glücks-Fuchsschwanz, zuletzt beim Skatepark gesehen. Pink, mit goldenem Ring.', 'Mia', 'mia@web.de', 48.1393, 11.5765, null),
  ('gefunden', 'Silberner Discman, liegengeblieben in Bus 123, Sitzreihe hinten.', 'Jonas', 'jonas@web.de', 48.1355, 11.5820, 300),
  ('gefunden', 'Ein Handschuh (links), in der Turnhalle abgegeben.', 'Fundbüro', null, 48.1366, 11.5697, null);

-- 4) Kontakt-Relay: Kontakt bleibt privat, Antworten laufen per E-Mail -----
-- „hat_kontakt" ist öffentlich sichtbar, der Kontakt selbst nie.
alter table meldungen add column if not exists hat_kontakt boolean
  generated always as (kontakt is not null) stored;

-- Lesezugriff auf Einzelspalten: OHNE „kontakt"!
revoke select on table public.meldungen from anon;
grant select (id, created_at, art, text, name, lat, lng, radius_m, hat_kontakt)
  on table public.meldungen to anon;

-- Privates Protokoll fürs Kontaktformular (nur service_role kommt dran).
create table if not exists kontakt_anfragen (
  id         bigint generated always as identity primary key,
  meldung_id bigint references meldungen(id) on delete set null,
  absender   text not null check (char_length(absender) <= 200),
  nachricht  text not null check (char_length(nachricht) between 3 and 1000),
  ip_hash    text,
  created_at timestamptz not null default now()
);
alter table kontakt_anfragen enable row level security;
-- bewusst KEINE Policies: anon/authenticated haben keinerlei Zugriff.

