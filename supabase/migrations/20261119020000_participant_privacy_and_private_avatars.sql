-- Privacy follow-ups (2026-11-19).
--
-- 1. Any signed-in student could list every trip's participants, because the
--    original policy only checked that the parent listing was a visible trip.
--    Participation is now visible only to the participant and the trip owner.
--
-- 2. 20261026011000 closed avatar uploads, but legacy objects stayed in a
--    public bucket at the predictable {user_id}/avatar path, and owner IDs are
--    public on listings. Stuora shows no avatars, so the bucket is made private.
--    Owners keep their own read and delete access, and delete-account still
--    clears the bucket with the service role.
begin;

drop policy if exists "trip_participants_read_visible_trip" on public.trip_participants;
drop policy if exists "trip_participants_read_self_or_owner" on public.trip_participants;
create policy "trip_participants_read_self_or_owner"
on public.trip_participants for select
to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.listings l
    where l.id = trip_participants.trip_listing_id
      and l.kind = 'trip'
      and l.owner_id = (select auth.uid())
  )
);

update storage.buckets set public = false where id = 'avatars';

commit;
