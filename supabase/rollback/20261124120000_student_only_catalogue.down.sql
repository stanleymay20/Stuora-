-- Rollback for 20261124120000_student_only_catalogue.sql (staging only).
-- Restores the catalogue to what 20261124110000 left: published posts readable by
-- anon and authenticated, details and photo metadata public, group names public.
-- If 20261124121000 (private bucket) was applied, roll that back first.
begin;
drop policy listings_read_student_catalogue_or_owned on public.listings;
create policy listings_read_published_or_owned on public.listings for select to anon, authenticated
  using ((status = 'active'::public.listing_status and review_status in ('not_required', 'approved'))
         or owner_id = (select auth.uid()));
alter policy housing_read_when_parent_visible on public.housing_details to anon, authenticated;
alter policy marketplace_read_when_parent_visible on public.marketplace_details to anon, authenticated;
alter policy trip_read_when_parent_visible on public.trip_details to anon, authenticated;
alter policy job_read_when_parent_visible on public.job_details to anon, authenticated;
alter policy event_read_when_parent_visible on public.event_details to anon, authenticated;
alter policy listing_media_read_visible on public.listing_media to anon, authenticated;
drop policy student_groups_browse_students on public.student_groups;
create policy student_groups_browse_public on public.student_groups for select to anon, authenticated using (true);
commit;
