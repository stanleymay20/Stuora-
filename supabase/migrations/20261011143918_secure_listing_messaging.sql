-- Mirrors the hosted migration history exactly. This migration was followed by
-- 20261012014031_restore_private_listing_messaging.sql, which restores the
-- intended private SECURITY DEFINER implementation + public SECURITY INVOKER wrapper.

alter table public.conversations
  add column if not exists listing_id uuid references public.listings(id) on delete cascade;

create unique index if not exists conversations_listing_creator_uidx
  on public.conversations (listing_id, creator_id)
  where listing_id is not null;

-- Until their dedicated, atomic publishing flows exist, clients may only create
-- the two listing kinds that Stuora currently supports end-to-end.
drop policy if exists "listings_insert_owned" on public.listings;
create policy "listings_insert_owned"
on public.listings for insert to authenticated
with check (
  owner_id = (select auth.uid())
  and kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
);

revoke insert on public.conversations from authenticated;
revoke insert on public.conversation_members from authenticated;
drop policy if exists "conversations_create_self" on public.conversations;
drop policy if exists "conversation_members_creator_adds" on public.conversation_members;

create or replace function public.start_listing_conversation(p_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
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

  insert into public.conversations (creator_id, title, listing_id)
  values (v_user, left('Listing: ' || v_title, 200), p_listing_id)
  on conflict (listing_id, creator_id) where listing_id is not null
  do update set title = excluded.title
  returning id into v_conversation;

  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation, v_user), (v_conversation, v_owner)
  on conflict do nothing;

  return v_conversation;
end;
$$;

revoke all on function public.start_listing_conversation(uuid) from public;
revoke all on function public.start_listing_conversation(uuid) from anon;
grant execute on function public.start_listing_conversation(uuid) to authenticated;
