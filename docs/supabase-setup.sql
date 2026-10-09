-- Digitales Fundbüro — Supabase Setup
-- Ausführen im Supabase SQL-Editor (einmalig, in dieser Reihenfolge).
-- Alles ist wiederholbar (create or replace / if not exists).

-- 1) Tabelle ---------------------------------------------------------------
create table if not exists meldungen (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  art        text not null check (art in ('verloren','gefunden','verschenken','gesucht')),
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

-- 4) Kontaktwege, Postfach & Ende-zu-Ende-Verschlüsselung -------------------
-- Der Poster wählt „offen" (Kontakt steht im Eintrag) ODER „postfach".
-- Postfach-Nachrichten werden IM BROWSER mit dem öffentlichen Schlüssel des
-- Posters verschlüsselt — in der Datenbank liegt nur Chiffre. Der private
-- Schlüssel steckt allein im geheimen Link des Posters (URL-#-Fragment,
-- das nie an einen Server geht). Niemand außer dem Poster kann mitlesen.

-- Altlasten früherer Entwürfe entfernen
drop table if exists kontakt_anfragen;
alter table meldungen drop column if exists hat_kontakt;

-- Neue Spalten auf meldungen
alter table meldungen add column if not exists kontakt_modus text not null default 'postfach'
  check (kontakt_modus in ('offen','postfach'));
alter table meldungen add column if not exists postfach_token uuid;
alter table meldungen add column if not exists postfach_pubkey text;
alter table meldungen add column if not exists laeuft_ab_am timestamptz;

-- Abgelaufene Beiträge verschwinden automatisch aus der öffentlichen Sicht
-- (in „Mein Bereich" sieht der Poster sie weiterhin).
drop policy if exists "alle lesen" on meldungen;
create policy "alle lesen" on meldungen for select
  using (laeuft_ab_am is null or laeuft_ab_am > now());

-- Lesezugriff auf Einzelspalten: Tokens/Geheimnisse NIE öffentlich.
revoke select on table public.meldungen from anon;
grant select (id, created_at, art, text, name, lat, lng, radius_m,
              kontakt, kontakt_modus, postfach_pubkey, laeuft_ab_am)
  on table public.meldungen to anon;

-- Antworten: NUR Chiffren (alte Klartext-Version wird ersetzt)
drop table if exists nachrichten;
create table nachrichten (
  id         bigint generated always as identity primary key,
  meldung_id bigint not null references meldungen(id) on delete cascade,
  inhalt     text not null, -- base64-JSON {v, iv, ct, key}, verschlüsselt mit dem Public Key des Posters
  ip_hash    text,
  created_at timestamptz not null default now()
);
create index if not exists nachrichten_meldung_idx on nachrichten (meldung_id);
alter table nachrichten enable row level security;
-- bewusst KEINE Policies: nur die Funktionen unten (SECURITY DEFINER) kommen ran.

-- Sperrliste (Missbrauch): Betreiber trägt den ip_hash eintragen (mehr sieht
-- der Server bei E2E-Verschlüsselung ohnehin nicht).
create table if not exists sperren (
  id         bigint generated always as identity primary key,
  wert       text not null unique,
  notiz      text,
  created_at timestamptz not null default now()
);
alter table sperren enable row level security;

-- Alte Funktions-Signaturen aufräumen, damit die neuen greifen
drop function if exists nachricht_senden(bigint, text, text, text, text);
drop function if exists nachrichten_lesen(uuid);
drop function if exists nachricht_loeschen(uuid, bigint);
drop function if exists beitrag_info(uuid);
drop function if exists meldung_loeschen(uuid);

-- Antwort senden: nimmt nur die fertige Chiffre entgegen. Gate = Längen-
-- prüfung, Modus-Check, Sperrliste, Drossel (5/Stunde pro IP-Hash).
create or replace function nachricht_senden(
  p_meldung_id bigint,
  p_inhalt text,
  p_honig text default ''
) returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_ip     text;
  v_hash   text;
  v_count  int;
  v_modus  text;
  v_inhalt text := trim(coalesce(p_inhalt, ''));
begin
  if coalesce(trim(p_honig), '') <> '' then
    return jsonb_build_object('ok', true); -- Bot: still „Erfolg" melden
  end if;

  if char_length(v_inhalt) < 24 or char_length(v_inhalt) > 20000 then
    return jsonb_build_object('ok', false, 'fehler', 'Die Nachricht ist leer oder zu groß.');
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

  if exists (select 1 from sperren where wert = v_hash) then
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

  insert into nachrichten (meldung_id, inhalt, ip_hash)
    values (p_meldung_id, v_inhalt, v_hash);
  return jsonb_build_object('ok', true);
end;
$$;

-- Postfach lesen: liefert NUR Chiffren — entschlüsselt wird im Browser
-- des Posters mit dem privaten Schlüssel aus seinem geheimen Link.
create or replace function nachrichten_lesen(p_token uuid)
returns table (
  id bigint,
  inhalt text,
  created_at timestamptz
)
language sql security definer set search_path = public
as $$
  select n.id, n.inhalt, n.created_at
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

-- Beitrags-Verwaltung per geheimem Token (jeder Beitrag bekommt einen):
-- „Mein Bereich" zeigt damit den eigenen Beitrag an und kann ihn löschen.
create or replace function beitrag_info(p_token uuid)
returns table (
  id bigint,
  created_at timestamptz,
  art text,
  text text,
  kontakt_modus text,
  laeuft_ab_am timestamptz
)
language sql security definer set search_path = public
as $$
  select m.id, m.created_at, m.art, m.text, m.kontakt_modus, m.laeuft_ab_am
  from meldungen m
  where m.postfach_token = p_token;
$$;

-- Beitrag löschen (nur mit Token); Antworten hängen per ON DELETE CASCADE dran.
create or replace function meldung_loeschen(p_token uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_id bigint;
begin
  delete from meldungen m
  where m.postfach_token = p_token
  returning m.id into v_id;
  if v_id is null then
    return jsonb_build_object('ok', false, 'fehler', 'Nichts gelöscht — ist der Link komplett?');
  end if;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 6) Stimmen (Upvotes) ------------------------------------------------------
-- Besucher stimmen ohne Konto/Cookie ab: eine Stimme pro Meldung und IP-Hash,
-- umschaltbar (Toggle). Der Zähler lebt denormalisiert auf meldungen und wird
-- per Trigger gepflegt; die Stimmen-Tabelle ist nach außen unsichtbar.

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
