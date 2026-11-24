-- Rollback for 20261124110000_student_activity_review.sql (staging only).
-- Roll back 20261124120000 first. Data loss: review decisions in
-- private.activity_reviews and notices of kind 'activity_review' are deleted;
-- Jobs, Trips and Events become published again as soon as they are active.
begin;
drop trigger b_activity_review on public.listings;
drop trigger rereview_on_detail_change on public.job_details;
drop trigger rereview_on_detail_change on public.trip_details;
drop trigger rereview_on_detail_change on public.event_details;
drop trigger b_require_published_activity on public.job_applications;
drop trigger b_require_published_activity on public.trip_participants;
drop trigger b_require_published_activity on public.event_participants;
drop trigger b_require_published_activity on public.conversations;
drop function public.review_student_activity(uuid, text, text);
drop function public.list_pending_student_activities();
drop function private.require_published_activity();
drop function private.rereview_on_detail_change();
drop function private.guard_activity_review();

drop policy listings_read_published_or_owned on public.listings;
create policy listings_read_active_or_owned on public.listings for select to anon, authenticated
  using ((status = 'active'::public.listing_status) or (owner_id = (select auth.uid())));

delete from public.moderation_notices where kind = 'activity_review';
alter table public.moderation_notices drop constraint moderation_notices_kind_check;
alter table public.moderation_notices add constraint moderation_notices_kind_check
  check (kind in ('report_outcome', 'content_action', 'account_suspended', 'suspension_lifted'));

drop table private.activity_reviews;
drop index public.listings_pending_review_idx;
alter table public.listings drop constraint listings_review_required_for_activities;
alter table public.listings drop column reviewed_at, drop column review_status;
commit;
