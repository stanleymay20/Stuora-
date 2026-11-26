-- Rollback for 20261126090000_gismate_location_engine.sql (staging only).
-- Removes the location engine and its imported GeoNames data.
begin;
drop function public.geo_city_search(text, integer);
drop function private.geo_load_tsv(text, text, text);
drop function private.geo_activate_dataset(text);
drop function private.geo_fold(text, boolean);
drop table private.geo_place_names;
drop table private.geo_places;
drop table private.geo_datasets;
commit;
