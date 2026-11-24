-- DRAFT FOR STAGING REVIEW. Do not apply to production (mljmifovcthvtuquvyzf).
-- Requires 20261124120000_student_only_catalogue.sql.
--
-- Apply only after every installed client that students use loads listing
-- photos through signed URLs (the build containing src/listings/listingPhotoUrls.ts).
-- Installed 0.1.6 builds use public URLs: once this runs, their photos stop
-- loading. See docs/STUDENT_ONLY_CATALOGUE.md.
begin;

-- The bucket was public: anyone with an object URL could download it. Make it
-- private and allow reading a photo only when its metadata row is visible to
-- the caller (that subquery runs under listing_media and listings RLS). The
-- existing owner policy keeps authors' access to their own uploads.
-- Clients load photos through short-lived signed URLs (createSignedUrls).
update storage.buckets set public = false where id = 'listing-media';

create policy listing_media_student_select on storage.objects for select to authenticated
  using (bucket_id = 'listing-media'
         and exists (select 1 from public.listing_media m where m.object_path = storage.objects.name));

commit;
