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

-- 4) Kontaktwege: Offener Kontakt ODER anonymes Postfach -------------------
-- Der Poster wählt aktiv einen Weg; beide schließen sich aus.
-- „offen": kontakt wird im Eintrag angezeigt. „postfach": Antworten landen
-- in nachrichten und sind nur mit dem geheimen Token lesbar.
-- (ersetzt den früheren Relay-Entwurf; falls dessen Teile existieren: weg damit)

drop table if exists kontakt_anfragen;
alter table meldungen drop column if exists hat_kontakt;

alter table meldungen add column if not exists kontakt_modus text not null default 'postfach'
  check (kontakt_modus in ('offen','postfach'));
alter table meldungen add column if not exists postfach_token uuid;

-- Lesezugriff auf Einzelspalten: kontakt (nur bei „offen" gefüllt) ist
-- öffentlich, postfach_token NIEMALS.
revoke select on table public.meldungen from anon;
grant select (id, created_at, art, text, name, lat, lng, radius_m, kontakt, kontakt_modus)
  on table public.meldungen to anon;

-- Antworten fürs anonyme Postfach:
create table if not exists nachrichten (
  id             bigint generated always as identity primary key,
  meldung_id     bigint not null references meldungen(id) on delete cascade,
  absender_name  text check (char_length(absender_name) <= 60),
  absender_email text not null check (char_length(absender_email) <= 200),
  nachricht      text not null check (char_length(nachricht) between 3 and 1000),
  ip_hash        text,
  created_at     timestamptz not null default now()
);
create index if not exists nachrichten_meldung_idx on nachrichten (meldung_id);
alter table nachrichten enable row level security;
-- bewusst KEINE Policies: nur die Funktionen unten (SECURITY DEFINER) kommen ran.

-- Sperrliste (Missbrauch): Betreiber trägt E-Mail oder ip_hash ein.
create table if not exists sperren (
  id         bigint generated always as identity primary key,
  wert       text not null unique,
  notiz      text,
  created_at timestamptz not null default now()
);
alter table sperren enable row level security;

-- Antwort senden: Gate (E-Mail + Text), Honigtopf, Sperrliste, Drossel (5/h).
create or replace function nachricht_senden(
  p_meldung_id bigint,
  p_name text,
  p_email text,
  p_nachricht text,
  p_honig text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ip     text;
  v_hash   text;
  v_count  int;
  v_modus  text;
  v_name   text := nullif(trim(coalesce(p_name, '')), '');
  v_email  text := trim(coalesce(p_email, ''));
  v_text   text := trim(coalesce(p_nachricht, ''));
begin
  if coalesce(trim(p_honig), '') <> '' then
    return jsonb_build_object('ok', true); -- Bot: still „Erfolg" melden
  end if;

  if v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or char_length(v_email) > 200 then
    return jsonb_build_object('ok', false, 'fehler', 'Bitte gib eine gültige E-Mail an.');
  end if;
  if char_length(v_text) < 3 or char_length(v_text) > 1000 then
    return jsonb_build_object('ok', false, 'fehler', 'Die Nachricht muss zwischen 3 und 1000 Zeichen lang sein.');
  end if;

  select kontakt_modus into v_modus from meldungen where id = p_meldung_id;
  if v_modus is null then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Meldung gibt es nicht (mehr).');
  end if;
  if v_modus <> 'postfach' then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Meldung setzt auf offenen Kontakt — schreib die Person direkt an!');
  end if;

  v_ip := coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', '');
  v_ip := trim(split_part(v_ip, ',', 1));
  v_hash := md5('fundbuero|' || v_ip);

  if exists (select 1 from sperren where wert in (v_email, v_hash)) then
    return jsonb_build_object('ok', false, 'fehler', 'Diese Anfrage wurde gesperrt.');
  end if;

  select count(*) into v_count from nachrichten
    where ip_hash = v_hash and created_at > now() - interval '1 hour';
  if v_count >= 5 then
    return jsonb_build_object('ok', false, 'fehler', 'Zu viele Anfragen — bitte warte eine Stunde und versuch es dann nochmal.');
  end if;

  select count(*) into v_count from nachrichten where meldung_id = p_meldung_id;
  if v_count >= 50 then
    return jsonb_build_object('ok', false, 'fehler', 'Dieses Postfach ist voll — der Poster muss erst aufräumen.');
  end if;

  insert into nachrichten (meldung_id, absender_name, absender_email, nachricht, ip_hash)
    values (p_meldung_id, v_name, v_email, v_text, v_hash);
  return jsonb_build_object('ok', true);
end;
$$;

-- Postfach lesen: nur mit dem geheimen Token.
create or replace function nachrichten_lesen(p_token uuid)
returns table (
  id bigint,
  absender_name text,
  absender_email text,
  nachricht text,
  created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select n.id, n.absender_name, n.absender_email, n.nachricht, n.created_at
  from nachrichten n
  join meldungen m on m.id = n.meldung_id
  where m.postfach_token = p_token
  order by n.id desc;
$$;

-- Einzelne Antwort löschen (nur mit Token).
create or replace function nachricht_loeschen(p_token uuid, p_id bigint)
returns jsonb
language plpgsql security definer set search_path = public
as $$
begin
  delete from nachrichten n
  using meldungen m
  where n.id = p_id
    and m.id = n.meldung_id
    and m.postfach_token = p_token;
  return jsonb_build_object('ok', true);
end;
$$;

