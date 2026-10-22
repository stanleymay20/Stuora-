-- Controlled staging-first quarantine of legacy public listing-media writes.
-- This deliberately PAUSES client photo creation; it does not activate the
-- Deno trusted-media Edge service or make the public delivery bucket private.
-- Keep public read and owner cleanup of historical media available.
begin;
  -- A leaked/old client cannot attach unverified media metadata directly.
  revoke insert on table public.listing_media from public, anon, authenticated;
  drop policy if exists "listing_media_insert_owned" on public.listing_media;

  -- Storage table grants remain for avatar uploads; remove only the
  -- listing-media RLS write policies, including upsert/update.
  drop policy if exists "listing_media_owner_insert" on storage.objects;
  drop policy if exists "listing_media_owner_update" on storage.objects;

  -- The trusted server role retains metadata writes for a future qualified
  -- intake cutover. Its own trigger enforces listing ownership/path/quotas.
  grant select, insert, delete on table public.listing_media to service_role;
commit;
