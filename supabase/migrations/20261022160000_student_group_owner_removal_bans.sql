-- Stuora P0: owner removal must revoke membership persistently. A user who
-- voluntarily leaves a group may rejoin, but an owner-removed user may not.
-- Source-owned, forward-only. No existing membership rows are rewritten.
begin;

create table public.student_group_bans (
  group_id uuid not null references public.student_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  banned_by uuid not null references public.profiles(id) on delete cascade,
  banned_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index student_group_bans_owner_review_idx
  on public.student_group_bans (group_id, banned_at desc);
alter table public.student_group_bans enable row level security;
revoke all on public.student_group_bans from public, anon, authenticated;
grant select on public.student_group_bans to authenticated;
create policy student_group_bans_owner_read on public.student_group_bans
  for select to authenticated
  using (exists (select 1 from public.student_groups as g
                 where g.id = student_group_bans.group_id
                   and g.owner_id = (select auth.uid())));

-- Group owners cannot remove a student using direct DELETE: that would not
-- create the persistent restriction. Voluntary non-owner departure is allowed.
drop policy if exists student_group_members_leave_or_remove on public.student_group_members;
create policy student_group_members_leave_self on public.student_group_members
  for delete to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.student_groups as g
                where g.id = student_group_members.group_id
                  and g.owner_id <> (select auth.uid()))
  );

-- Serialize join against owner removal on the group row. FOR SHARE conflicts
-- with FOR UPDATE taken by owner moderation, closing the join/ban race.
-- This trigger runs at the database boundary, including direct REST inserts.
create function private.guard_student_group_join()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform 1 from public.student_groups g
    where g.id = new.group_id for share;
  if exists (select 1 from public.student_group_bans b
             where b.group_id = new.group_id and b.user_id = new.user_id) then
    raise exception 'Group membership unavailable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger student_group_members_prevent_banned_join
  before insert on public.student_group_members
  for each row execute function private.guard_student_group_join();

-- A send that started just before removal cannot race in a message after
-- the owner has committed a ban. Serialize message INSERT with moderation,
-- then recheck membership and ban state at the actual write boundary.
create function private.guard_student_group_message_insert()
returns trigger language plpgsql security definer set search_path = ''
as $
begin
  perform 1 from public.student_groups g
    where g.id = new.group_id for share;
  if (select auth.uid()) is distinct from new.author_id
     or not exists (select 1 from public.student_group_members m
                    where m.group_id = new.group_id and m.user_id = new.author_id)
     or exists (select 1 from public.student_group_bans b
                where b.group_id = new.group_id and b.user_id = new.author_id) then
    raise exception 'Group posting unavailable' using errcode = '42501';
  end if;
  return new;
end;
$;
create trigger student_group_messages_verify_membership_at_insert
  before insert on public.student_group_messages
  for each row execute function private.guard_student_group_message_insert();

-- Privileged code lives ONLY in the unexposed private schema. Each action
-- rechecks the actual current user's ownership; caller-supplied IDs alone
-- never authorize a removal or a reinstatement.
create function private.owner_remove_student_group_member(
  p_group_id uuid, p_user_id uuid
) returns void language plpgsql security definer set search_path = ''
as $$
declare actor uuid := (select auth.uid()); group_owner uuid;
begin
  if actor is null or p_group_id is null or p_user_id is null then
    raise exception 'Unauthorized group moderation' using errcode = '42501';
  end if;
  select g.owner_id into group_owner from public.student_groups g
    where g.id = p_group_id for update;
  if group_owner is distinct from actor or p_user_id = group_owner then
    raise exception 'Only the group creator can remove other members'
      using errcode = '42501';
  end if;
  insert into public.student_group_bans(group_id, user_id, banned_by)
    values (p_group_id, p_user_id, actor)
    on conflict (group_id, user_id) do nothing;
  delete from public.student_group_members m
    where m.group_id = p_group_id and m.user_id = p_user_id;
end;
$$;

create function private.owner_restore_student_group_member(
  p_group_id uuid, p_user_id uuid
) returns void language plpgsql security definer set search_path = ''
as $$
declare actor uuid := (select auth.uid()); group_owner uuid;
begin
  if actor is null or p_group_id is null or p_user_id is null then
    raise exception 'Unauthorized group moderation' using errcode = '42501';
  end if;
  select g.owner_id into group_owner from public.student_groups g
    where g.id = p_group_id for update;
  if group_owner is distinct from actor or p_user_id = group_owner then
    raise exception 'Only the group creator can restore membership access'
      using errcode = '42501';
  end if;
  delete from public.student_group_bans b
    where b.group_id = p_group_id and b.user_id = p_user_id;
  -- Restoring eligibility does NOT silently join the student to the group.
end;
$$;

-- Thin invoker wrappers for PostgREST; the privileged functions remain private.
create function public.remove_student_group_member(
  p_group_id uuid, p_user_id uuid
) returns void language sql security invoker set search_path = ''
as $$ select private.owner_remove_student_group_member(p_group_id, p_user_id) $$;
create function public.restore_student_group_member(
  p_group_id uuid, p_user_id uuid
) returns void language sql security invoker set search_path = ''
as $$ select private.owner_restore_student_group_member(p_group_id, p_user_id) $$;

revoke all on function private.guard_student_group_join() from public, anon, authenticated;
revoke all on function private.guard_student_group_message_insert() from public, anon, authenticated;
revoke all on function private.owner_remove_student_group_member(uuid, uuid)
  from public, anon, authenticated;
revoke all on function private.owner_restore_student_group_member(uuid, uuid)
  from public, anon, authenticated;
grant execute on function private.owner_remove_student_group_member(uuid, uuid) to authenticated;
grant execute on function private.owner_restore_student_group_member(uuid, uuid) to authenticated;
revoke all on function public.remove_student_group_member(uuid, uuid) from public, anon, authenticated;
revoke all on function public.restore_student_group_member(uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_student_group_member(uuid, uuid) to authenticated;
grant execute on function public.restore_student_group_member(uuid, uuid) to authenticated;

commit;
