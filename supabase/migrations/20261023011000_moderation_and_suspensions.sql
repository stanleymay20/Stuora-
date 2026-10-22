-- Gen-3 audit D-11: platform moderation, account suspension and DSA-style
-- statements of reasons. Forward-only; existing direct report inserts keep
-- working (and stay rate-limited by private.limit_student_actions).
--
-- Design:
--  * Moderators are appointed ONLY by an operator with database access
--    (insert into public.moderators). No client path can grant the role.
--  * Students report through public.report_content(), which snapshots the
--    reported text so moderators see the evidence without gaining general
--    read access to private conversations or groups.
--  * Moderators decide through public.moderate_report(); every decision needs
--    a written reason, which is delivered to the affected student and the
--    reporter as a moderation notice (statement of reasons).
--  * Suspended accounts cannot create listings, conversations, messages,
--    groups, memberships or group posts, and are hidden from People.
begin;

create table public.moderators (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  added_at timestamptz not null default now()
);
alter table public.moderators enable row level security;
revoke all on public.moderators from public, anon, authenticated;

create table public.account_suspensions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 10 and 1000),
  suspended_by uuid references public.profiles(id) on delete set null,
  suspended_at timestamptz not null default now()
);
alter table public.account_suspensions enable row level security;
revoke all on public.account_suspensions from public, anon, authenticated;
grant select on public.account_suspensions to authenticated;
create policy account_suspensions_read_own on public.account_suspensions
  for select to authenticated using (user_id = (select auth.uid()));

create function private.is_moderator(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.moderators m where m.user_id = p_user);
$$;
create function private.is_suspended(p_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (select 1 from public.account_suspensions s where s.user_id = p_user);
$$;
revoke all on function private.is_moderator(uuid) from public, anon, authenticated;
revoke all on function private.is_suspended(uuid) from public, anon, authenticated;
-- Needed by the People directory RLS policy (evaluated as the reader).
grant execute on function private.is_suspended(uuid) to authenticated;

create function public.am_i_moderator()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_moderator((select auth.uid()));
$$;
revoke all on function public.am_i_moderator() from public, anon;
grant execute on function public.am_i_moderator() to authenticated;

-- Reports gain evidence, targets and a decision record.
alter table public.reports
  add column status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  add column group_message_id uuid references public.student_group_messages(id) on delete set null,
  add column message_id uuid references public.messages(id) on delete set null,
  add column content_snapshot text not null default '' check (char_length(content_snapshot) <= 4000),
  add column decided_by uuid references public.profiles(id) on delete set null,
  add column decided_at timestamptz,
  add column decision text check (decision is null or decision in ('dismiss', 'remove_content', 'suspend_user')),
  add column decision_reason text check (decision_reason is null or char_length(btrim(decision_reason)) between 10 and 1000);
create index reports_status_created_idx on public.reports (status, created_at);
create index reports_group_message_idx on public.reports (group_message_id);
create index reports_message_idx on public.reports (message_id);
create index reports_decided_by_idx on public.reports (decided_by);
-- Existing client column grants (reporter_id, listing_id, reported_user_id,
-- reason, details) are unchanged: clients cannot write status or decisions.

create table public.moderation_notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  kind text not null check (kind in ('report_outcome', 'content_action', 'account_suspended', 'suspension_lifted')),
  message text not null check (char_length(message) between 1 and 1500),
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index moderation_notices_user_idx on public.moderation_notices (user_id, created_at desc);
create index moderation_notices_report_idx on public.moderation_notices (report_id);
alter table public.moderation_notices enable row level security;
revoke all on public.moderation_notices from public, anon, authenticated;
grant select on public.moderation_notices to authenticated;
grant update (read_at) on public.moderation_notices to authenticated;
create policy moderation_notices_read_own on public.moderation_notices
  for select to authenticated using (user_id = (select auth.uid()));
create policy moderation_notices_mark_read_own on public.moderation_notices
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Student-facing reporting. The reporter must be able to see the content.
create function public.report_content(
  p_target_kind text, p_target_id uuid, p_reason public.report_reason, p_details text default ''
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  v_reported uuid; v_listing uuid; v_group_message uuid; v_message uuid;
  v_snapshot text; v_id uuid;
begin
  if actor is null or not exists (select 1 from public.profiles p where p.id = actor) then
    raise exception 'Complete your profile before reporting' using errcode = '42501';
  end if;
  if p_target_id is null or p_reason is null or p_details is null or char_length(p_details) > 2000 then
    raise exception 'Invalid report' using errcode = '22023';
  end if;
  if p_target_kind = 'listing' then
    select l.owner_id, l.id, left(l.title || E'\n' || l.description, 4000)
      into v_reported, v_listing, v_snapshot
      from public.listings l
     where l.id = p_target_id and l.status = 'active'::public.listing_status;
  elsif p_target_kind = 'group_message' then
    select m.author_id, m.id, left(m.body, 4000)
      into v_reported, v_group_message, v_snapshot
      from public.student_group_messages m
     where m.id = p_target_id
       and exists (select 1 from public.student_group_members gm
                    where gm.group_id = m.group_id and gm.user_id = actor);
  elsif p_target_kind = 'message' then
    select m.sender_id, m.id, left(m.body, 4000)
      into v_reported, v_message, v_snapshot
      from public.messages m
     where m.id = p_target_id
       and exists (select 1 from public.conversation_members cm
                    where cm.conversation_id = m.conversation_id and cm.user_id = actor);
  elsif p_target_kind = 'user' then
    select p.id, left(p.display_name || E'\n' || p.bio, 4000)
      into v_reported, v_snapshot
      from public.profiles p where p.id = p_target_id;
  else
    raise exception 'Unsupported report target' using errcode = '22023';
  end if;
  if v_reported is null then
    raise exception 'That content is not available to report' using errcode = '22023';
  end if;
  if v_reported = actor then
    raise exception 'You cannot report yourself' using errcode = '22023';
  end if;
  insert into public.reports (reporter_id, listing_id, reported_user_id, group_message_id,
                              message_id, reason, details, content_snapshot)
  values (actor, v_listing, v_reported, v_group_message, v_message, p_reason,
          btrim(p_details), coalesce(v_snapshot, ''))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.report_content(text, uuid, public.report_reason, text) from public, anon;
grant execute on function public.report_content(text, uuid, public.report_reason, text) to authenticated;

-- Moderator queue: evidence and history, never the reporter's identity.
create function public.moderation_queue(p_status text default 'open', p_limit integer default 50)
returns table (
  id uuid, created_at timestamptz, reason public.report_reason, details text, status text,
  target_kind text, listing_id uuid, group_message_id uuid, message_id uuid,
  reported_user_id uuid, content_snapshot text, prior_reports bigint,
  decision text, decision_reason text, decided_at timestamptz
) language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_moderator((select auth.uid())) then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  if p_status is null or p_status not in ('open', 'actioned', 'dismissed') then
    raise exception 'Invalid status' using errcode = '22023';
  end if;
  return query
    select r.id, r.created_at, r.reason, r.details, r.status,
           case when r.listing_id is not null then 'listing'
                when r.group_message_id is not null then 'group_message'
                when r.message_id is not null then 'message'
                else 'user' end,
           r.listing_id, r.group_message_id, r.message_id, r.reported_user_id,
           r.content_snapshot,
           (select count(*) from public.reports x
             where x.reported_user_id = r.reported_user_id and x.id <> r.id),
           r.decision, r.decision_reason, r.decided_at
      from public.reports r
     where r.status = p_status
     order by case when p_status = 'open' then r.created_at end asc,
              r.decided_at desc nulls last
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end;
$$;
revoke all on function public.moderation_queue(text, integer) from public, anon;
grant execute on function public.moderation_queue(text, integer) to authenticated;

create function public.moderate_report(p_report uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := (select auth.uid());
  r public.reports;
  v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_moderator(actor) then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  if p_action is null or p_action not in ('dismiss', 'remove_content', 'suspend_user')
     or char_length(v_reason) not between 10 and 1000 then
    raise exception 'A decision and a reason of 10 to 1000 characters are required' using errcode = '22023';
  end if;
  select * into r from public.reports where id = p_report for update;
  if not found or r.status <> 'open' then
    raise exception 'Report is missing or already decided' using errcode = '22023';
  end if;
  if r.reported_user_id = actor or r.reporter_id = actor then
    raise exception 'Moderators cannot decide reports they are party to' using errcode = '42501';
  end if;

  if p_action = 'remove_content' then
    if r.listing_id is not null then
      update public.listings set status = 'closed'::public.listing_status
       where id = r.listing_id and status <> 'closed'::public.listing_status;
    elsif r.group_message_id is not null then
      delete from public.student_group_messages where id = r.group_message_id;
    elsif r.message_id is not null then
      delete from public.messages where id = r.message_id;
    else
      raise exception 'A user report has no content to remove; suspend or dismiss instead' using errcode = '22023';
    end if;
  elsif p_action = 'suspend_user' then
    if r.reported_user_id is null then
      raise exception 'The reported account no longer exists' using errcode = '22023';
    end if;
    insert into public.account_suspensions (user_id, reason, suspended_by)
      values (r.reported_user_id, v_reason, actor)
      on conflict (user_id) do nothing;
    update public.listings set status = 'closed'::public.listing_status
     where owner_id = r.reported_user_id and status <> 'closed'::public.listing_status;
    update public.profiles set is_discoverable = false where id = r.reported_user_id;
  end if;

  update public.reports
     set status = case when p_action = 'dismiss' then 'dismissed' else 'actioned' end,
         decided_by = actor, decided_at = now(), decision = p_action, decision_reason = v_reason
   where id = p_report;

  -- Statement of reasons to the affected student (DSA Art. 17 style).
  if p_action <> 'dismiss' and r.reported_user_id is not null then
    insert into public.moderation_notices (user_id, report_id, kind, message)
    values (r.reported_user_id, r.id,
            case when p_action = 'suspend_user' then 'account_suspended' else 'content_action' end,
            left(case when p_action = 'suspend_user'
                      then 'Your Stuora account has been suspended. Reason: '
                      else 'Stuora moderators removed content you posted. Reason: ' end
                 || v_reason || ' You can contact Stuora through the Imprint page to dispute this decision.', 1500));
  end if;
  -- Outcome to the reporter, without disclosing sanctions in detail.
  if r.reporter_id is not null then
    insert into public.moderation_notices (user_id, report_id, kind, message)
    values (r.reporter_id, r.id, 'report_outcome',
            case when p_action = 'dismiss'
                 then 'Thank you for your report. Moderators reviewed it and found no violation of the Stuora rules.'
                 else 'Thank you for your report. Moderators reviewed it and took action.' end);
  end if;
end;
$$;
revoke all on function public.moderate_report(uuid, text, text) from public, anon;
grant execute on function public.moderate_report(uuid, text, text) to authenticated;

create function public.lift_suspension(p_user uuid, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid()); v_reason text := btrim(coalesce(p_reason, ''));
begin
  if not private.is_moderator(actor) then
    raise exception 'Moderator access required' using errcode = '42501';
  end if;
  if p_user is null or char_length(v_reason) not between 10 and 1000 then
    raise exception 'A reason of 10 to 1000 characters is required' using errcode = '22023';
  end if;
  delete from public.account_suspensions where user_id = p_user;
  if not found then raise exception 'Account is not suspended' using errcode = '22023'; end if;
  insert into public.moderation_notices (user_id, kind, message)
  values (p_user, 'suspension_lifted', left('Your Stuora account suspension was lifted. ' || v_reason, 1500));
end;
$$;
revoke all on function public.lift_suspension(uuid, text) from public, anon;
grant execute on function public.lift_suspension(uuid, text) to authenticated;

-- Suspended accounts cannot create new content anywhere. Named "a_..." so it
-- runs before rate-limit triggers and does not consume a suspended user's quota.
create function private.reject_suspended_actor()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is not null and private.is_suspended((select auth.uid())) then
    raise exception 'Your Stuora account is suspended' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_suspended_actor() from public, anon, authenticated;
create trigger a_suspension_guard before insert on public.listings
  for each row execute function private.reject_suspended_actor();
create trigger a_suspension_guard before insert on public.conversations
  for each row execute function private.reject_suspended_actor();
create trigger a_suspension_guard before insert on public.messages
  for each row execute function private.reject_suspended_actor();
create trigger a_suspension_guard before insert on public.student_groups
  for each row execute function private.reject_suspended_actor();
create trigger a_suspension_guard before insert on public.student_group_members
  for each row execute function private.reject_suspended_actor();
create trigger a_suspension_guard before insert on public.student_group_messages
  for each row execute function private.reject_suspended_actor();

commit;
