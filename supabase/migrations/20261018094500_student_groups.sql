-- Student-created public groups: deterministic memberships and member-only discussions.
-- Additive staging-first migration. Never use listing conversation_members as group membership.
begin;

-- Independent internal quota ledger; never depend on an unmerged PR's private schema.
create schema if not exists private;
create table private.student_group_action_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null check (action in ('student_group_create','student_group_message')),
  window_start timestamptz not null default now(),
  used integer not null default 0 check (used >= 0),
  primary key (user_id, action)
);
alter table private.student_group_action_limits enable row level security;
revoke all on private.student_group_action_limits from public, anon, authenticated;

create table public.student_groups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 3 and 80),
  description text not null default '' check (char_length(description) <= 1000),
  city text not null check (char_length(btrim(city)) between 2 and 120),
  topic text not null check (topic in ('Study', 'University', 'Housing', 'Career', 'Travel', 'Culture', 'Hobbies', 'Other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index student_groups_recent_idx on public.student_groups (created_at desc, id);
create index student_groups_city_idx on public.student_groups (city);
create index student_groups_owner_idx on public.student_groups (owner_id, created_at desc);
create trigger student_groups_updated_at before update on public.student_groups
  for each row execute function public.set_updated_at();

create table public.student_group_members (
  group_id uuid not null references public.student_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index student_group_members_user_idx on public.student_group_members (user_id, joined_at desc);

create table public.student_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.student_groups(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index student_group_messages_group_time_idx
  on public.student_group_messages (group_id, created_at desc, id desc);
create index student_group_messages_author_idx
  on public.student_group_messages (author_id, created_at desc);

alter table public.student_groups enable row level security;
alter table public.student_group_members enable row level security;
alter table public.student_group_messages enable row level security;

-- Revoke broad inherited defaults (Supabase can pregrant public-table access).
revoke all on public.student_groups, public.student_group_members, public.student_group_messages
  from public, anon, authenticated;
grant select on public.student_groups to anon, authenticated;
grant update (name, description, city, topic), delete on public.student_groups to authenticated;
grant select, insert, delete on public.student_group_members to authenticated;
grant select, delete on public.student_group_messages to authenticated;

create policy student_groups_browse_public on public.student_groups
  for select to anon, authenticated using (true);
create policy student_groups_update_owner on public.student_groups
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));
create policy student_groups_delete_owner on public.student_groups
  for delete to authenticated using (owner_id = (select auth.uid()));

-- Only the member or the group owner may see member identity; everyone else
-- sees just public group metadata. Group messages remain entirely member-only.
create policy student_group_members_read_self_or_owner on public.student_group_members
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (select 1 from public.student_groups g
               where g.id = student_group_members.group_id and g.owner_id = (select auth.uid()))
  );
create policy student_group_members_join_self on public.student_group_members
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.student_groups g where g.id = group_id)
    and exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.account_kind = 'student')
  );
create policy student_group_members_leave_or_remove on public.student_group_members
  for delete to authenticated
  using (
    exists (
      select 1 from public.student_groups g where g.id = group_id
        and user_id <> g.owner_id
        and (user_id = (select auth.uid()) or g.owner_id = (select auth.uid()))
    )
  );

create policy student_group_messages_read_member on public.student_group_messages
  for select to authenticated
  using (exists (select 1 from public.student_group_members m
    where m.group_id = group_id and m.user_id = (select auth.uid())));
create policy student_group_messages_delete_author_or_owner on public.student_group_messages
  for delete to authenticated
  using (
    author_id = (select auth.uid())
    or exists (select 1 from public.student_groups g
       where g.id = group_id and g.owner_id = (select auth.uid()))
  );

create function public.create_student_group(
  p_name text, p_description text, p_city text, p_topic text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  new_id uuid;
  quota_used integer;
begin
  if actor is null then raise exception 'Sign in to create a group' using errcode = '42501'; end if;
  if p_name is null or char_length(btrim(p_name)) not between 3 and 80
    or p_description is null or char_length(p_description) > 1000
    or p_city is null or char_length(btrim(p_city)) not between 2 and 120
    or p_topic is null or p_topic not in ('Study','University','Housing','Career','Travel','Culture','Hobbies','Other')
  then raise exception 'Invalid group information' using errcode = '22023'; end if;

  -- Lock the actor profile to serialize simultaneous creates and protect limits.
  perform 1 from public.profiles p
    where p.id = actor and p.account_kind = 'student'
    for update;
  if not found then raise exception 'Complete a student profile before creating a group' using errcode = '42501'; end if;
  if (select count(*) from public.student_groups where owner_id = actor) >= 10
  then raise exception 'Group creation limit reached' using errcode = 'P0001'; end if;
  -- The existing private action ledger survives group deletions and prevents
  -- bypassing the daily quota by deleting and recreating groups.
  insert into private.student_group_action_limits(user_id, action, window_start, used)
    values (actor, 'student_group_create', now(), 1)
    on conflict (user_id, action) do update set
      used = case when private.student_group_action_limits.window_start <= now() - interval '24 hours'
        then 1 else private.student_group_action_limits.used + 1 end,
      window_start = case when private.student_group_action_limits.window_start <= now() - interval '24 hours'
        then now() else private.student_group_action_limits.window_start end
    returning used into quota_used;
  if quota_used > 3 then raise exception 'Group creation limit reached' using errcode = 'P0001'; end if;
  insert into public.student_groups (owner_id, name, description, city, topic)
    values (actor, btrim(p_name), p_description, btrim(p_city), p_topic)
    returning id into new_id;
  insert into public.student_group_members (group_id, user_id) values (new_id, actor);
  return new_id;
end;
$$;

create function public.send_student_group_message(
  p_group_id uuid, p_body text
) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare actor uuid := (select auth.uid()); new_id uuid; quota_used integer;
begin
  if actor is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if p_group_id is null or p_body is null or char_length(btrim(p_body)) not between 1 and 1000
  then raise exception 'Invalid message' using errcode = '22023'; end if;
  -- Serialize message submissions per account and enforce a modest spam limit.
  perform 1 from public.profiles p where p.id = actor for update;
  if not found then raise exception 'Profile required' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.student_group_members m
      where m.group_id = p_group_id and m.user_id = actor
  ) then raise exception 'Join the group to post' using errcode = '42501'; end if;
  insert into private.student_group_action_limits(user_id, action, window_start, used)
    values (actor, 'student_group_message', now(), 1)
    on conflict (user_id, action) do update set
      used = case when private.student_group_action_limits.window_start <= now() - interval '1 minute'
        then 1 else private.student_group_action_limits.used + 1 end,
      window_start = case when private.student_group_action_limits.window_start <= now() - interval '1 minute'
        then now() else private.student_group_action_limits.window_start end
    returning used into quota_used;
  if quota_used > 10 then raise exception 'Please wait before posting again' using errcode = 'P0001'; end if;
  insert into public.student_group_messages (group_id, author_id, body)
    values (p_group_id, actor, btrim(p_body)) returning id into new_id;
  return new_id;
end;
$$;

revoke all on function public.create_student_group(text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.create_student_group(text,text,text,text) to authenticated;
revoke all on function public.send_student_group_message(uuid,text)
  from public, anon, authenticated;
grant execute on function public.send_student_group_message(uuid,text) to authenticated;

commit;
