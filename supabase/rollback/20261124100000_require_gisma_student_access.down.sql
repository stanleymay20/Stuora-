-- Rollback for 20261124100000_require_gisma_student_access.sql (staging only).
-- Roll back 20261124110000 first, and DISABLE the Before User Created hook in the
-- dashboard before running this (the hook function is dropped here).
-- Not reversed: profiles hidden from the directory stay hidden; students re-enable it.
-- Function bodies below are the live staging definitions read back on 24 Nov 2026.
begin;
do $$
declare t text;
begin
  foreach t in array array['profiles','listings','housing_details','marketplace_details','job_details',
    'trip_details','event_details','listing_media','saved_listings','conversations','conversation_members',
    'messages','reports','student_groups','student_group_members','student_group_messages',
    'student_group_files','job_applications','trip_participants','event_participants',
    'publisher_requests','benefit_redemptions'] loop
    execute format('drop trigger a_student_guard on public.%I', t);
  end loop;
  foreach t in array array['profiles','messages','student_group_messages','student_group_members',
    'student_group_files','job_applications','trip_participants','event_participants'] loop
    execute format('drop policy a_student_only_read on public.%I', t);
  end loop;
end $$;

create or replace function private.is_quota_eligible(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_student is not null
     and not private.is_suspended(p_student)
     and exists (select 1 from public.profiles p where p.id = p_student)
     and exists (select 1 from auth.users u where u.id = p_student
                  and (to_jsonb(u) ->> 'email_confirmed_at') is not null);
$$;

create or replace function private.require_community_student() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_quota_eligible(auth.uid()) or not exists (
    select 1 from auth.users u join public.profiles p on p.id=u.id
    where u.id=auth.uid() and p.account_kind='student' and p.student_status <> 'rejected'
      and lower(to_jsonb(u)->>'email') ~ '^[^@[:space:]]+@gisma-student[.]com$'
  ) then raise exception 'A confirmed GISMA student account is required' using errcode='42501'; end if;
end $$;

create or replace function public.can_read_student_group_files(p_group uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null
    and exists (
      select 1 from public.student_group_members m
      where m.group_id = p_group and m.user_id = (select auth.uid())
    )
    and not exists (
      select 1 from public.student_group_bans b
      where b.group_id = p_group and b.user_id = (select auth.uid())
    )
$$;

drop function public.hook_require_gisma_signup(jsonb);
drop function private.current_user_is_gisma_student();
drop function private.reject_non_student_actor();
drop function private.is_gisma_student(uuid);
drop function private.is_gisma_student_account(uuid);
drop function private.has_gisma_student_email(uuid);
commit;
