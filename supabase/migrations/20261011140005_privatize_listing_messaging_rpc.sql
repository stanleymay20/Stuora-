create schema if not exists private;

create or replace function private.start_listing_conversation_impl(p_listing_id uuid)
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

revoke all on function private.start_listing_conversation_impl(uuid) from public;
revoke all on function private.start_listing_conversation_impl(uuid) from anon;
grant usage on schema private to authenticated;
grant execute on function private.start_listing_conversation_impl(uuid) to authenticated;

create or replace function public.start_listing_conversation(p_listing_id uuid)
returns uuid
language sql
security invoker
set search_path = public, private, pg_temp
as $$
  select private.start_listing_conversation_impl(p_listing_id)
$$;

revoke all on function public.start_listing_conversation(uuid) from public;
revoke all on function public.start_listing_conversation(uuid) from anon;
grant execute on function public.start_listing_conversation(uuid) to authenticated;
