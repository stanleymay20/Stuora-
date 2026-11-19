-- GA safety hardening.
-- 1. Listings: server-owned timestamps, content-only insert surface, required
--    category details and a single source of truth for housing rent.
-- 2. Messaging: user blocks, no forced re-adding to conversations, member-scoped
--    reports and server-side rate limits.
-- 3. Media: server-enforced photo limit, active-listing uploads only, metadata
--    must reference a real uploaded object, private avatars.
-- 4. Trip participation is visible only to the participant and the trip owner.
begin;

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Listings
-- ---------------------------------------------------------------------------

-- Clients could previously insert any column, including created_at, and pin a
-- listing to the top of the newest-first feed indefinitely.
revoke insert on public.listings from authenticated;
grant insert (owner_id, kind, status, title, description, city, price_cents, currency)
  on public.listings to authenticated;

create function private.stamp_listing_insert()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.created_at := now();
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.stamp_listing_insert() from public, anon, authenticated;
create trigger listings_stamp_insert
before insert on public.listings
for each row execute function private.stamp_listing_insert();

-- Housing and Marketplace listings must be created together with their details
-- row (save_student_listing does this in one transaction). Checked at commit.
create function private.require_listing_details()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.listings l where l.id = new.id) then
    return null;
  end if;
  if new.kind = 'housing' and not exists (select 1 from public.housing_details d where d.listing_id = new.id) then
    raise exception 'Housing listings require housing details' using errcode = '23514';
  end if;
  if new.kind = 'marketplace' and not exists (select 1 from public.marketplace_details d where d.listing_id = new.id) then
    raise exception 'Marketplace listings require marketplace details' using errcode = '23514';
  end if;
  return null;
end;
$$;
revoke all on function private.require_listing_details() from public, anon, authenticated;
create constraint trigger listings_require_details
after insert on public.listings
deferrable initially deferred
for each row execute function private.require_listing_details();

-- Details rows are removed only by cascading from their listing.
revoke delete on public.housing_details, public.marketplace_details from authenticated;

-- listings.price_cents is the source of truth for housing rent.
create function private.housing_rent_from_listing()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.rent_cents := coalesce(
    (select l.price_cents from public.listings l where l.id = new.listing_id),
    new.rent_cents);
  return new;
end;
$$;
revoke all on function private.housing_rent_from_listing() from public, anon, authenticated;
create trigger housing_details_rent_from_listing
before insert or update on public.housing_details
for each row execute function private.housing_rent_from_listing();

create function private.sync_housing_rent()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.housing_details set rent_cents = new.price_cents
  where listing_id = new.id and rent_cents is distinct from new.price_cents;
  return null;
end;
$$;
revoke all on function private.sync_housing_rent() from public, anon, authenticated;
create trigger listings_sync_housing_rent
after update of price_cents on public.listings
for each row
when (new.kind = 'housing' and new.price_cents is not null and new.price_cents is distinct from old.price_cents)
execute function private.sync_housing_rent();

-- ---------------------------------------------------------------------------
-- 2. Messaging safety
-- ---------------------------------------------------------------------------

create table public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id);
alter table public.user_blocks enable row level security;
revoke all on public.user_blocks from public, anon, authenticated;
grant select, delete on public.user_blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.user_blocks to authenticated;

create policy "user_blocks_read_own" on public.user_blocks
for select to authenticated using (blocker_id = (select auth.uid()));
create policy "user_blocks_create_own" on public.user_blocks
for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "user_blocks_remove_own" on public.user_blocks
for delete to authenticated using (blocker_id = (select auth.uid()));

-- Helpers answer only questions about the caller; they never accept a caller ID.
create function private.is_conversation_member(target_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation and cm.user_id = (select auth.uid())
  );
$$;
revoke all on function private.is_conversation_member(uuid) from public, anon, authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;

create function private.conversation_has_block(target_conversation uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.conversation_members other
    join public.user_blocks b
      on (b.blocker_id = (select auth.uid()) and b.blocked_id = other.user_id)
      or (b.blocker_id = other.user_id and b.blocked_id = (select auth.uid()))
    where other.conversation_id = target_conversation
      and other.user_id <> (select auth.uid())
  );
$$;
revoke all on function private.conversation_has_block(uuid) from public, anon, authenticated;
grant execute on function private.conversation_has_block(uuid) to authenticated;

-- Members may see who else is in their conversation (needed to block/report).
drop policy "conversation_members_read_self" on public.conversation_members;
create policy "conversation_members_read_comembers" on public.conversation_members
for select to authenticated
using (user_id = (select auth.uid()) or private.is_conversation_member(conversation_id));

-- A block stops messages in both directions.
drop policy "messages_send_as_self_member" on public.messages;
create policy "messages_send_as_self_member" on public.messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and private.is_conversation_member(messages.conversation_id)
  and not private.conversation_has_block(messages.conversation_id)
);

-- Message rate limit: 20 per minute and 500 per day per sender.
-- SQLSTATE PT429 maps to HTTP 429 in PostgREST.
create index if not exists messages_sender_created_idx on public.messages (sender_id, created_at desc);
create function private.limit_message_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('stuora.messages:' || new.sender_id::text, 0));
  if (select count(*) from public.messages m
      where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute') >= 20
    or (select count(*) from public.messages m
      where m.sender_id = new.sender_id and m.created_at > now() - interval '1 day') >= 500 then
    raise exception 'You are sending messages too quickly. Please wait and retry.' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_message_rate() from public, anon, authenticated;
create trigger messages_limit_rate
before insert on public.messages
for each row execute function private.limit_message_rate();

-- Conversation start: blocks are respected, at most 15 new threads per hour,
-- and an existing thread only ever re-adds the caller, never someone who left.
create or replace function private.start_listing_conversation_impl(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
  v_title text;
  v_conversation uuid;
begin
  if v_user is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.profiles p where p.id = v_user) then
    raise exception 'Complete your profile before messaging' using errcode = '42501';
  end if;

  select l.owner_id, l.title
    into v_owner, v_title
  from public.listings l
  where l.id = p_listing_id
    and l.status = 'active'::public.listing_status
    and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind);

  if not found then
    raise exception 'Listing is unavailable for messaging' using errcode = '22023';
  end if;

  if v_owner = v_user then
    raise exception 'You cannot message yourself about your own listing' using errcode = '22023';
  end if;

  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = v_user and b.blocked_id = v_owner)
       or (b.blocker_id = v_owner and b.blocked_id = v_user)
  ) then
    raise exception 'Messaging is unavailable for this listing' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('stuora.conversations:' || v_user::text, 0));

  select c.id into v_conversation
  from public.conversations c
  where c.listing_id = p_listing_id and c.creator_id = v_user;

  if v_conversation is null then
    if (select count(*) from public.conversations c
        where c.creator_id = v_user and c.created_at > now() - interval '1 hour') >= 15 then
      raise exception 'You are starting conversations too quickly. Please wait and retry.' using errcode = 'PT429';
    end if;

    insert into public.conversations (creator_id, title, listing_id)
    values (v_user, left('Listing: ' || v_title, 160), p_listing_id)
    returning id into v_conversation;

    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation, v_user), (v_conversation, v_owner);
  else
    insert into public.conversation_members (conversation_id, user_id)
    values (v_conversation, v_user)
    on conflict do nothing;
  end if;

  return v_conversation;
end;
$$;
revoke all on function private.start_listing_conversation_impl(uuid) from public, anon;
grant execute on function private.start_listing_conversation_impl(uuid) to authenticated;

-- Reports may reference a conversation the reporter belongs to.
alter table public.reports
  add column conversation_id uuid references public.conversations(id) on delete set null;
create index reports_conversation_idx on public.reports (conversation_id);
alter table public.reports drop constraint reports_check;
alter table public.reports add constraint reports_target_check
  check (listing_id is not null or reported_user_id is not null or conversation_id is not null);
grant insert (conversation_id) on public.reports to authenticated;

drop policy "reports_insert_self" on public.reports;
create policy "reports_insert_self" on public.reports
for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and (conversation_id is null or private.is_conversation_member(conversation_id))
);

create function private.limit_report_rate()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.reports r
      where r.reporter_id = new.reporter_id and r.created_at > now() - interval '1 day') >= 30 then
    raise exception 'Report limit reached. Please contact support.' using errcode = 'PT429';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_report_rate() from public, anon, authenticated;
create trigger reports_limit_rate
before insert on public.reports
for each row execute function private.limit_report_rate();

-- ---------------------------------------------------------------------------
-- 3. Media
-- ---------------------------------------------------------------------------

drop policy "listing_media_insert_owned" on public.listing_media;
create policy "listing_media_insert_owned" on public.listing_media
for insert to authenticated
with check (
  array_length(string_to_array(object_path, '/'), 1) = 3
  and split_part(object_path, '/', 1) = (select auth.uid())::text
  and split_part(object_path, '/', 2) = listing_id::text
  and exists (
    select 1 from public.listings l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
      and l.status = 'active'::public.listing_status
      and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
  )
  and exists (
    select 1 from storage.objects o
    where o.bucket_id = 'listing-media' and o.name = object_path
  )
);

create function private.limit_listing_media()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.listings l where l.id = new.listing_id for update;
  if (select count(*) from public.listing_media m where m.listing_id = new.listing_id) >= 6 then
    raise exception 'A listing can have at most 6 photos' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function private.limit_listing_media() from public, anon, authenticated;
create trigger listing_media_limit
before insert on public.listing_media
for each row execute function private.limit_listing_media();

drop policy "listing_media_owner_insert" on storage.objects;
create policy "listing_media_owner_insert" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'listing-media'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.owner_id = (select auth.uid())
      and l.status = 'active'::public.listing_status
      and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
  )
);

drop policy "listing_media_owner_update" on storage.objects;
create policy "listing_media_owner_update" on storage.objects
for update to authenticated
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'listing-media'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.owner_id = (select auth.uid())
      and l.status = 'active'::public.listing_status
      and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
  )
);

-- Avatars live at a predictable {user_id}/avatar path, and owner IDs are public
-- on listings. Serve them privately: owners, plus signed-in users who can see
-- the profile under profiles RLS (discoverable profiles).
update storage.buckets set public = false where id = 'avatars';
drop policy if exists "avatars_read_visible_profile" on storage.objects;
create policy "avatars_read_visible_profile" on storage.objects
for select to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.profiles p
    where p.id::text = (storage.foldername(name))[1]
  )
);

-- ---------------------------------------------------------------------------
-- 4. Trip participation privacy
-- ---------------------------------------------------------------------------

drop policy "trip_participants_read_visible_trip" on public.trip_participants;
create policy "trip_participants_read_self_or_owner" on public.trip_participants
for select to authenticated
using (
  user_id = (select auth.uid())
  or exists (
    select 1 from public.listings l
    where l.id = trip_listing_id and l.kind = 'trip' and l.owner_id = (select auth.uid())
  )
);

commit;
