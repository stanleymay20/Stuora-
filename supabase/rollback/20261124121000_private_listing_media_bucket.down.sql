-- Rollback for 20261124121000_private_listing_media_bucket.sql (staging only).
begin;
drop policy listing_media_student_select on storage.objects;
update storage.buckets set public = true where id = 'listing-media';
commit;
