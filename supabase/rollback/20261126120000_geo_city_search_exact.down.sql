-- Rollback for 20261126120000_geo_city_search_exact.sql (staging only).
-- Restores geo_city_search without the `exact` field.
begin;
create or replace function public.geo_city_search(p_query text, p_limit integer default 8)
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
commit;
