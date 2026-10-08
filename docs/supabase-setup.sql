-- Digitales Fundbüro — Supabase Setup
-- Ausführen im Supabase SQL-Editor (einmalig, in dieser Reihenfolge).

-- 1) Tabelle ---------------------------------------------------------------
create table if not exists meldungen (
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
