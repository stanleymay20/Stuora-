-- DRAFT FOR STAGING REVIEW. Do not apply to production (mljmifovcthvtuquvyzf).
-- Requires 20261124100000 (GISMA-only access) and 20261124110000 (activity review).
--
-- Stuora is student-only. Student-posted listings, their details, listing
-- photo metadata and group names become readable only by a
-- signed-in, confirmed GISMA student, plus each author's own rows. Signed-out
-- visitors and legacy non-GISMA accounts receive no student content from the
-- API. Photo files follow in 20261124121000_private_listing_media_bucket.sql,
-- which is applied separately (see docs/STUDENT_ONLY_CATALOGUE.md).
--
-- Unchanged and still public: sign-in, signup, recovery, the legal, privacy,
-- safety and support pages (static app content), and Stuora-verified
-- student_benefits, which are curated offers, not student posts.
--
-- Table grants are not revoked. A request that is no longer allowed returns
-- an empty result, not an error, so installed 0.1.6 apps show empty states
-- rather than failures.
begin;

-- 1. Listings: published rows for GISMA students, own rows for their author ----
drop policy listings_read_published_or_owned on public.listings;
create policy listings_read_student_catalogue_or_owned on public.listings for select to authenticated
  using (owner_id = (select auth.uid())
         or ((select private.current_user_is_gisma_student())
             and status = 'active'::public.listing_status
             and review_status in ('not_required', 'approved')));

-- 2. Details and photo metadata follow the listing (their subqueries run under
--    listings RLS); only the anonymous role is removed.
alter policy housing_read_when_parent_visible on public.housing_details to authenticated;
alter policy marketplace_read_when_parent_visible on public.marketplace_details to authenticated;
alter policy trip_read_when_parent_visible on public.trip_details to authenticated;
alter policy job_read_when_parent_visible on public.job_details to authenticated;
alter policy event_read_when_parent_visible on public.event_details to authenticated;
alter policy listing_media_read_visible on public.listing_media to authenticated;

-- 3. Group names: GISMA students browse; owners keep their own groups ----------
-- No membership clause: student_group_members' policy already reads
-- student_groups (recursion), and legacy non-GISMA members must not see names.
drop policy student_groups_browse_public on public.student_groups;
create policy student_groups_browse_students on public.student_groups for select to authenticated
  using (owner_id = (select auth.uid()) or (select private.current_user_is_gisma_student()));

commit;
