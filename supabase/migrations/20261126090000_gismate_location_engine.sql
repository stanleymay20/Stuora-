-- DRAFT FOR STAGING REVIEW. Do not apply to production without explicit approval.
--
-- Gismate Location Engine: city lookup from openly licensed GeoNames data
-- (CC BY 4.0) held in our own database, replacing calls to the public
-- OpenStreetMap servers that refuse Supabase Edge traffic (HTTP 403).
--
-- * Data lives in the unexposed `private` schema; clients get nothing directly.
-- * public.geo_city_search() is callable by service_role only, so every lookup
--   still goes through external-data: signed-in, GISMA-only, quota-limited.
-- * Datasets are versioned (scripts/geonames/build-import.mjs). A version
--   becomes active only after private.geo_activate_dataset() has checked that
--   every row in its manifest arrived; the previous version is kept for rollback.
begin;

create table private.geo_datasets (
  version text primary key check (version ~ '^[a-z0-9-]{8,64}$'),
  source text not null,
  licence text not null,
  attribution text not null,
  manifest jsonb not null,
  expected_places integer not null check (expected_places > 0),
  expected_names integer not null check (expected_names > 0),
  loaded_at timestamptz not null default now(),
  activated_at timestamptz,
  active boolean not null default false
);
create unique index geo_datasets_one_active on private.geo_datasets (active) where active;

create table private.geo_places (
  dataset_version text not null references private.geo_datasets (version) on delete cascade,
  geonameid integer not null,
  name text not null check (char_length(name) between 1 and 200),
  ascii_name text,
  admin1_name text,
  admin2_name text,
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  country_name text not null,
  latitude numeric(8, 5) not null check (latitude between -90 and 90),
  longitude numeric(8, 5) not null check (longitude between -180 and 180),
  population bigint not null default 0 check (population >= 0),
  feature_code text not null,
  primary key (dataset_version, geonameid)
);

create table private.geo_place_names (
  dataset_version text not null,
  geonameid integer not null,
  name_key text not null check (name_key ~ '^[a-z0-9]([a-z0-9 ]*[a-z0-9])?$'),
  is_primary boolean not null,
  primary key (dataset_version, name_key, geonameid),
  foreign key (dataset_version, geonameid) references private.geo_places (dataset_version, geonameid) on delete cascade
);
-- Prefix search ("pots" → potsdam) on the active version.
create index geo_place_names_prefix on private.geo_place_names (dataset_version, name_key text_pattern_ops);

revoke all on private.geo_datasets, private.geo_places, private.geo_place_names from public, anon, authenticated;

-- Must match fold() in scripts/geonames/build-import.mjs (tests keep them equal).
create function private.geo_fold(p_value text, p_transliterate boolean default false)
returns text language plpgsql immutable strict set search_path = '' as $$
declare v text := lower(normalize(p_value, NFC));
begin
  if p_transliterate then
    v := replace(replace(replace(v, 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue');
  end if;
  v := replace(replace(replace(replace(replace(replace(v, 'ß', 'ss'), 'æ', 'ae'), 'œ', 'oe'), 'ø', 'o'), 'ł', 'l'), 'đ', 'd');
  v := regexp_replace(normalize(v, NFD), '[\u0300-\u036f]', '', 'g');
  return btrim(regexp_replace(v, '[^a-z0-9]+', ' ', 'g'));
end $$;

create function private.geo_activate_dataset(p_version text)
returns void language plpgsql security definer set search_path = '' as $$
declare d private.geo_datasets; n_places integer; n_names integer; v_previous text;
begin
  select * into d from private.geo_datasets where version = p_version for update;
  if not found then raise exception 'Unknown dataset %', p_version using errcode = '22023'; end if;
  select count(*) into n_places from private.geo_places where dataset_version = p_version;
  select count(*) into n_names from private.geo_place_names where dataset_version = p_version;
  if n_places <> d.expected_places or n_names <> d.expected_names then
    raise exception 'Dataset % incomplete: % of % places, % of % names', p_version,
      n_places, d.expected_places, n_names, d.expected_names using errcode = '22023';
  end if;
  select version into v_previous from private.geo_datasets where active and version <> p_version;
  update private.geo_datasets set active = false where active and version <> p_version;
  update private.geo_datasets set active = true, activated_at = now() where version = p_version;
  -- Keep the newly active version and the one it replaced (rollback); drop the rest.
  delete from private.geo_datasets where version not in (p_version, coalesce(v_previous, p_version));
end $$;
revoke all on function private.geo_activate_dataset(text) from public, anon, authenticated;

-- Loads one TSV file produced by scripts/geonames/build-import.mjs into an
-- inactive dataset. The body is parsed as plain data (never executed) and must
-- match the SHA-256 recorded in that dataset's manifest. Operators with psql
-- may use \copy instead; this exists for loaders without a file system.
create function private.geo_load_tsv(p_version text, p_file text, p_body text)
returns integer language plpgsql security definer set search_path = '' as $$
declare d private.geo_datasets; v_expected text; v_rows integer;
begin
  select * into d from private.geo_datasets where version = p_version for update;
  if not found or d.active then raise exception 'Dataset % is unknown or already active', p_version using errcode = '22023'; end if;
  v_expected := d.manifest #>> array['outputs', p_file];
  if v_expected is null or v_expected <> encode(sha256(convert_to(p_body, 'UTF8')), 'hex') then
    raise exception 'Checksum mismatch for % of %', p_file, p_version using errcode = '22023';
  end if;
  if p_file = 'places.tsv' then
    delete from private.geo_places where dataset_version = p_version;
    insert into private.geo_places (dataset_version, geonameid, name, ascii_name, admin1_name, admin2_name,
      country_code, country_name, latitude, longitude, population, feature_code)
    select p_version, f[1]::integer, f[2], nullif(f[3], ''), nullif(f[4], ''), nullif(f[5], ''), f[6], f[7],
           f[8]::numeric, f[9]::numeric, f[10]::bigint, f[11]
      from (select string_to_array(line, E'\t') f from string_to_table(rtrim(p_body, E'\n'), E'\n') line) t;
  elsif p_file = 'names.tsv' then
    delete from private.geo_place_names where dataset_version = p_version;
    insert into private.geo_place_names (dataset_version, geonameid, name_key, is_primary)
    select p_version, f[1]::integer, f[2], f[3] = 't'
      from (select string_to_array(line, E'\t') f from string_to_table(rtrim(p_body, E'\n'), E'\n') line) t;
  else
    raise exception 'Unknown file %', p_file using errcode = '22023';
  end if;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
revoke all on function private.geo_load_tsv(text, text, text) from public, anon, authenticated;

revoke all on function private.geo_fold(text, boolean) from public, anon, authenticated;

-- City candidates for a typed name: exact matches (official or alternate, e.g.
-- "Munich") before prefix matches; within each, larger places first, so the
-- city beats the hamlets that share its name.
-- Same-named places in one state get their district added, so every row is distinct.
create function public.geo_city_search(p_query text, p_limit integer default 8)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare v_key text; v_version text; v_limit integer := least(greatest(coalesce(p_limit, 8), 1), 10); result jsonb;
begin
  if p_query is null or char_length(p_query) > 80 then return '[]'::jsonb; end if;
  v_key := private.geo_fold(p_query, false);
  select version into v_version from private.geo_datasets where active;
  if v_version is null or char_length(v_key) < 2 then return '[]'::jsonb; end if;
  with hits as (
    select n.geonameid,
           max(case when n.name_key = v_key then 1 else 0 end) as score
      from private.geo_place_names n
     where n.dataset_version = v_version
       and (n.name_key = v_key or n.name_key like v_key || '%')
     group by n.geonameid
  ), ranked as (
    select p.*, h.score,
           count(*) over (partition by p.name, p.admin1_name) as same_name
      from hits h join private.geo_places p on p.dataset_version = v_version and p.geonameid = h.geonameid
     order by h.score desc, p.population desc,
              case when p.feature_code = 'PPLC' then 0 when p.feature_code ~ '^PPLA' then 1 else 2 end, p.geonameid
     limit 50
  ), picked as (
    select * from ranked
     order by score desc, population desc,
              case when feature_code = 'PPLC' then 0 when feature_code ~ '^PPLA' then 1 else 2 end, geonameid
     limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'name', name,
           'region', case when same_name > 1 and admin2_name is not null
                          then concat_ws(' · ', admin1_name, admin2_name) else coalesce(admin1_name, '') end,
           'district', coalesce(admin2_name, ''),
           'country', country_name,
           'countryCode', country_code,
           'latitude', latitude,
           'longitude', longitude,
           'population', population,
           'geonameId', geonameid)
         order by score desc, population desc,
                  case when feature_code = 'PPLC' then 0 when feature_code ~ '^PPLA' then 1 else 2 end, geonameid), '[]'::jsonb)
    into result from picked;
  return result;
end $$;
revoke all on function public.geo_city_search(text, integer) from public, anon, authenticated;
grant execute on function public.geo_city_search(text, integer) to service_role;

commit;
