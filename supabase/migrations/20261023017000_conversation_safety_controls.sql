-- Gen-3 audit D-07 (UI half): students can block the other person in a
-- listing conversation and see whether a thread is closed, without ever
-- learning the other member's account id (conversation_members RLS only
-- exposes the caller's own membership row).
begin;

create function public.conversation_safety_state(p_conversation uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); v_other uuid; v_status public.listing_status; v_has_listing boolean;
begin
  if actor is null or not exists (
    select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = actor
  ) then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;
  select m.user_id into v_other from public.conversation_members m
   where m.conversation_id = p_conversation and m.user_id <> actor limit 1;
  select c.listing_id is not null, l.status into v_has_listing, v_status
    from public.conversations c left join public.listings l on l.id = c.listing_id
   where c.id = p_conversation;
  return jsonb_build_object(
    'closed', coalesce(v_has_listing and v_status = 'closed'::public.listing_status, false),
    'blocked_by_me', v_other is not null and exists (
      select 1 from public.user_blocks b where b.blocker_id = actor and b.blocked_id = v_other),
    'other_member_left', v_other is null
  );
end;
$$;
revoke all on function public.conversation_safety_state(uuid) from public, anon;
grant execute on function public.conversation_safety_state(uuid) to authenticated;

create function public.set_conversation_block(p_conversation uuid, p_block boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); v_other uuid;
begin
  if actor is null or p_block is null or not exists (
    select 1 from public.conversation_members m where m.conversation_id = p_conversation and m.user_id = actor
  ) then
    raise exception 'Conversation unavailable' using errcode = '42501';
  end if;
  select m.user_id into v_other from public.conversation_members m
   where m.conversation_id = p_conversation and m.user_id <> actor limit 1;
  if v_other is null then
    raise exception 'The other person has left this conversation' using errcode = '22023';
  end if;
  if p_block then
    insert into public.user_blocks (blocker_id, blocked_id) values (actor, v_other)
    on conflict (blocker_id, blocked_id) do nothing;
  else
    delete from public.user_blocks where blocker_id = actor and blocked_id = v_other;
  end if;
end;
$$;
revoke all on function public.set_conversation_block(uuid, boolean) from public, anon;
grant execute on function public.set_conversation_block(uuid, boolean) to authenticated;

commit;
