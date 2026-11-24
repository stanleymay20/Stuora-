-- DRAFT FOR STAGING REVIEW. Do not apply to production (mljmifovcthvtuquvyzf).
-- Requires 20261124100000_require_gisma_student_access.sql.
--
-- Students may submit Jobs, Trips and Events, but confirming a university
-- email does not show that they represent an employer or may organise a trip.
-- Every such submission therefore starts as pending review. Only a Stuora
-- moderator can approve it; school administration is not involved.
--
-- Enforced on the server, so it also holds for older app versions:
--   * pending, rejected and re-edited posts are visible only to their author
--     (and to moderators through review functions); feeds, details and photos
--     follow the listing's visibility;
--   * applications, joins, RSVPs and new conversations need an approved post;
--   * clients cannot set review fields: there is no column privilege, and a
--     trigger refuses review changes outside the review functions;
--   * when the author edits an approved or rejected post, it returns to pending.
-- Housing, Marketplace and Ticketmaster browsing (external-data) are unchanged.
begin;

-- 1. Review state on listings -------------------------------------------------
alter table public.listings
  add column review_status text not null default 'not_required'
    check (review_status in ('not_required', 'pending', 'approved', 'rejected')),
  add column reviewed_at timestamptz;

-- Existing Jobs, Trips and Events have not been reviewed: hide them until they are.
update public.listings set review_status = 'pending' where kind in ('job', 'trip', 'event');

alter table public.listings add constraint listings_review_required_for_activities
  check ((kind in ('job', 'trip', 'event')) = (review_status <> 'not_required'));

-- anon and authenticated hold table-level SELECT on listings, so only the
-- outcome lives here. Who reviewed and why stay in a private audit table; the
-- author receives the reason through moderation_notices.
create table private.activity_reviews (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  decision text not null check (decision in ('approved', 'rejected')),
  reason text not null check (char_length(reason) between 10 and 1000),
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
revoke all on private.activity_reviews from public, anon, authenticated;
create index activity_reviews_listing_idx on private.activity_reviews (listing_id, created_at);

create index listings_pending_review_idx on public.listings (created_at)
  where review_status = 'pending';

-- 2. Review fields are set by the database, not by clients --------------------
create function private.guard_activity_review() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  trusted boolean := current_user = pg_catalog.pg_get_userbyid(
    (select relowner from pg_catalog.pg_class where oid = tg_relid));
begin
  if tg_op = 'INSERT' then
    new.review_status := case when new.kind in ('job', 'trip', 'event') then 'pending' else 'not_required' end;
    new.reviewed_at := null;
    return new;
  end if;

  if actor is not null and not trusted
     and (new.review_status, new.reviewed_at) is distinct from (old.review_status, old.reviewed_at) then
    raise exception 'Only Stuora moderators can review activities' using errcode = '42501';
  end if;

  -- The author changed what was reviewed: review it again.
  if old.review_status in ('approved', 'rejected') and actor is not null and actor = old.owner_id
     and (new.title, new.description, new.city, new.price_cents)
         is distinct from (old.title, old.description, old.city, old.price_cents) then
    new.review_status := 'pending';
    new.reviewed_at := null;
  end if;
  return new;
end $$;
revoke all on function private.guard_activity_review() from public, anon, authenticated;

-- "b_": after a_student_guard / a_suspension_guard, before integrity triggers.
create trigger b_activity_review before insert or update on public.listings
  for each row execute function private.guard_activity_review();

-- Edits to trip, event or job details also send the post back for review.
create function private.rereview_on_detail_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and to_jsonb(new) is distinct from to_jsonb(old) then
    update public.listings
       set review_status = 'pending', reviewed_at = null
     where id = new.listing_id and owner_id = (select auth.uid())
       and review_status in ('approved', 'rejected');
  end if;
  return new;
end $$;
revoke all on function private.rereview_on_detail_change() from public, anon, authenticated;

create trigger rereview_on_detail_change after update on public.job_details
  for each row execute function private.rereview_on_detail_change();
create trigger rereview_on_detail_change after update on public.trip_details
  for each row execute function private.rereview_on_detail_change();
create trigger rereview_on_detail_change after update on public.event_details
  for each row execute function private.rereview_on_detail_change();

-- 3. Only approved posts are published ----------------------------------------
drop policy listings_read_active_or_owned on public.listings;
create policy listings_read_published_or_owned on public.listings for select to anon, authenticated
  using ((status = 'active'::public.listing_status and review_status in ('not_required', 'approved'))
         or owner_id = (select auth.uid()));

-- 4. Only approved posts accept applications, joins, RSVPs or conversations -----
-- Trigger argument: the column naming the listing. Applies to every writer,
-- including listing_participation_impl and older app versions.
create function private.require_published_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_listing uuid := (to_jsonb(new) ->> tg_argv[0])::uuid;
begin
  if v_listing is not null and exists (
    select 1 from public.listings l
    where l.id = v_listing and l.kind in ('job', 'trip', 'event') and l.review_status <> 'approved'
  ) then
    raise exception 'This activity is awaiting Stuora review' using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.require_published_activity() from public, anon, authenticated;

create trigger b_require_published_activity before insert on public.job_applications
  for each row execute function private.require_published_activity('job_listing_id');
create trigger b_require_published_activity before insert on public.trip_participants
  for each row execute function private.require_published_activity('trip_listing_id');
create trigger b_require_published_activity before insert on public.event_participants
  for each row execute function private.require_published_activity('event_listing_id');
create trigger b_require_published_activity before insert on public.conversations
  for each row execute function private.require_published_activity('listing_id');

-- 5. Moderator review -----------------------------------------------------------
alter table public.moderation_notices drop constraint moderation_notices_kind_check;
alter table public.moderation_notices add constraint moderation_notices_kind_check
  check (kind in ('report_outcome', 'content_action', 'account_suspended', 'suspension_lifted', 'activity_review'));

create function public.list_pending_student_activities()
returns table (id uuid, kind public.listing_kind, title text, description text, city text,
               owner_id uuid, created_at timestamptz, details jsonb)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator((select auth.uid())) then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  return query
    select l.id, l.kind, l.title, l.description, l.city, l.owner_id, l.created_at,
           coalesce(to_jsonb(j) - 'listing_id', to_jsonb(t) - 'listing_id', to_jsonb(e) - 'listing_id')
      from public.listings l
      left join public.job_details j on j.listing_id = l.id
      left join public.trip_details t on t.listing_id = l.id
      left join public.event_details e on e.listing_id = l.id
     where l.review_status = 'pending' and l.status <> 'closed'::public.listing_status
     order by l.created_at
     limit 200;
end $$;

create function public.review_student_activity(p_listing uuid, p_decision text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  v_reason text := btrim(coalesce(p_reason, ''));
  l public.listings;
begin
  if not private.is_moderator(actor) then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  if p_decision is null or p_decision not in ('approve', 'reject')
     or char_length(v_reason) not between 10 and 1000 then
    raise exception 'A decision and a reason of 10 to 1000 characters are required' using errcode = '22023';
  end if;
  select * into l from public.listings where id = p_listing for update;
  if not found or l.kind not in ('job', 'trip', 'event') or l.review_status <> 'pending'
     or l.status = 'closed'::public.listing_status then
    raise exception 'Activity is missing or not awaiting review' using errcode = '22023';
  end if;
  if l.owner_id = actor then
    raise exception 'Moderators cannot review their own activities' using errcode = '42501';
  end if;
  update public.listings
     set review_status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
         reviewed_at = now()
   where id = l.id;
  insert into private.activity_reviews (listing_id, decision, reason, reviewed_by)
  values (l.id, case when p_decision = 'approve' then 'approved' else 'rejected' end, v_reason, actor);
  insert into public.moderation_notices (user_id, kind, message)
  values (l.owner_id, 'activity_review', left(case when p_decision = 'approve'
    then 'Your Stuora ' || l.kind || ' "' || l.title || '" was approved and is now visible to students.'
    else 'Your Stuora ' || l.kind || ' "' || l.title || '" was not approved. Reason: ' || v_reason
         || ' You can edit it and it will be reviewed again.' end, 1500));
end $$;

revoke all on function public.list_pending_student_activities() from public, anon;
revoke all on function public.review_student_activity(uuid, text, text) from public, anon;
grant execute on function public.list_pending_student_activities() to authenticated;
grant execute on function public.review_student_activity(uuid, text, text) to authenticated;

commit;
