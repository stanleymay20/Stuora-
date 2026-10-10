begin;

-- A conversation creator must be able to read the conversation before the
-- first membership row exists, otherwise the creator cannot add members.
drop policy if exists "conversations_read_member" on public.conversations;

create policy "conversations_read_creator_or_member"
on public.conversations for select
to authenticated
using (
  creator_id = (select auth.uid())
  or exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = id and cm.user_id = (select auth.uid())
  )
);

-- A listing's ownership and domain kind are immutable from public clients.
-- Students can edit content/status, but cannot turn a marketplace row into a
-- job/housing record or transfer ownership by changing identity columns.
revoke update on public.listings from authenticated;
grant update (status, title, description, city, price_cents, currency)
on public.listings to authenticated;

-- INSERT ... RETURNING expands SELECT and INSERT policies together. A direct
-- membership -> conversation -> membership dependency recurses even when the
-- creator predicate is true. This private helper answers only caller ownership;
-- it cannot return other users' conversations or accept an arbitrary caller ID.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
create function private.is_conversation_creator(target_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.conversations c
    where c.id = target_conversation and c.creator_id = (select auth.uid())
  );
$$;
revoke all on function private.is_conversation_creator(uuid) from public, anon, authenticated;
grant execute on function private.is_conversation_creator(uuid) to authenticated;

drop policy "conversation_members_creator_adds" on public.conversation_members;
create policy "conversation_members_creator_adds"
on public.conversation_members for insert to authenticated
with check (private.is_conversation_creator(conversation_members.conversation_id));

-- Identity/timestamps and review state are not public-client write surfaces.
revoke insert, update, delete on public.messages from authenticated;
grant insert (conversation_id, sender_id, body) on public.messages to authenticated;
revoke insert, update on public.conversations from authenticated;
grant insert (creator_id, title) on public.conversations to authenticated;
revoke insert, update on public.conversation_members from authenticated;
grant insert (conversation_id, user_id) on public.conversation_members to authenticated;
revoke insert, update, delete on public.reports from authenticated;
grant insert (reporter_id, listing_id, reported_user_id, reason, details) on public.reports to authenticated;

revoke update on public.housing_details, public.marketplace_details,
  public.trip_details, public.job_details, public.event_details from authenticated;
grant update (housing_type, rent_cents, deposit_cents, available_from, available_until,
  furnished, bills_included, room_size_sqm) on public.housing_details to authenticated;
grant update (item_condition, quantity, pickup_only) on public.marketplace_details to authenticated;
grant update (destination, starts_at, ends_at, capacity, estimated_cost_cents) on public.trip_details to authenticated;
grant update (company_name, compensation_text, hours_per_week_min, hours_per_week_max,
  workplace_mode, application_url) on public.job_details to authenticated;
grant update (starts_at, ends_at, capacity, venue_name) on public.event_details to authenticated;

-- Joining requires an atomic, capacity-enforcing server API. The prototype
-- policy alone permits overbooking, so direct joins remain closed until that
-- vertical slice is implemented. Clients may still read and leave their trips.
revoke insert on public.trip_participants from authenticated;

-- Cover referencing columns used by policies and cascading deletes.
create index saved_listings_listing_idx on public.saved_listings (listing_id);
create index trip_participants_user_idx on public.trip_participants (user_id);
create index job_applications_applicant_idx on public.job_applications (applicant_id);
create index conversations_creator_idx on public.conversations (creator_id);
create index conversation_members_user_idx on public.conversation_members (user_id);
create index messages_sender_idx on public.messages (sender_id);
create index student_benefits_listing_idx on public.student_benefits (listing_id);
create index benefit_redemptions_benefit_idx on public.benefit_redemptions (benefit_id);
create index benefit_redemptions_user_idx on public.benefit_redemptions (user_id);
create index reports_reporter_idx on public.reports (reporter_id);
create index reports_listing_idx on public.reports (listing_id);
create index reports_reported_user_idx on public.reports (reported_user_id);

revoke execute on function public.set_updated_at()
from public, anon, authenticated;

commit;
