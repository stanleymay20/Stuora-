-- DRAFT FOR STAGING REVIEW. Do not apply to production (mljmifovcthvtuquvyzf).
--
-- Stuora is student-only, but until now the GISMA check ran only in the app
-- (src/account/validation.ts) and in private.require_community_student.
-- Core writes (listings, messages, groups, reports, profiles) accepted any
-- confirmed email. This migration makes one server-side definition of
-- "a Stuora student" and enforces it on every student write path:
--
--   1. private.has_gisma_student_email / is_gisma_student_account / is_gisma_student:
--      the single rule (email, then + student profile, then + not suspended).
--   2. private.is_quota_eligible now requires it (AI and external-data quotas).
--   3. private.require_community_student reuses it (same rule as before).
--   4. BEFORE INSERT/UPDATE guard triggers on student-writable tables, so RLS
--      writes and SECURITY DEFINER RPCs are both covered.
--   5. Existing non-GISMA profiles are removed from the student directory.
--   6. public.hook_require_gisma_signup for Supabase Auth's Before User Created
--      hook. Enabling the hook is a separate dashboard step; see the review doc.
--
-- Deliberately still allowed for any signed-in account: deleting own content,
-- leaving groups and conversations, blocking/unblocking, archiving own
-- listings, hiding own profile, data export and account deletion.
-- Writes with no JWT (service role, migrations, moderation workers) are
-- unaffected, matching private.reject_suspended_actor.
begin;

-- 1. The rule ---------------------------------------------------------------
create function private.has_gisma_student_email(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is not null and exists (
    select 1 from auth.users u
    where u.id = p_user
      and (to_jsonb(u) ->> 'email_confirmed_at') is not null
      and lower(btrim(to_jsonb(u) ->> 'email')) ~ '^[^@[:space:]]+@gisma-student[.]com$'
  );
$$;

-- Account only. Suspension stays with the existing a_suspension_guard and
-- limit_suspended_reports triggers, so suspended students keep their error
-- message and the harassment-reporting path.
create function private.is_gisma_student_account(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.has_gisma_student_email(p_user)
     and exists (
       select 1 from public.profiles p
       where p.id = p_user and p.account_kind = 'student' and p.student_status <> 'rejected'
     );
$$;

-- Account and not suspended: the gate for quotas and community actions.
create function private.is_gisma_student(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_gisma_student_account(p_user) and not private.is_suspended(p_user);
$$;

revoke all on function private.has_gisma_student_email(uuid) from public, anon, authenticated;
revoke all on function private.is_gisma_student_account(uuid) from public, anon, authenticated;
revoke all on function private.is_gisma_student(uuid) from public, anon, authenticated;

-- 2. Quotas (consume_ai_request, consume_external_data_request) --------------
create or replace function private.is_quota_eligible(p_student uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_gisma_student(p_student);
$$;

-- 3. Community actions and external resources: same rule, one definition -----
create or replace function private.require_community_student() returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.is_gisma_student(auth.uid()) then
    raise exception 'A confirmed GISMA student account is required' using errcode = '42501';
  end if;
end $$;

-- 4. Write guard ------------------------------------------------------------
create function private.reject_non_student_actor() returns trigger
language plpgsql security definer set search_path = '' as $$
declare actor uuid := (select auth.uid());
begin
  if actor is null then return new; end if;

  if tg_table_name = 'profiles' then
    -- The profile does not exist yet on INSERT, so check the account itself.
    -- A non-student may still hide their own profile (and edit it while hidden).
    if private.has_gisma_student_email(actor)
       or (tg_op = 'UPDATE' and new.is_discoverable is false) then
      return new;
    end if;
  elsif private.is_gisma_student_account(actor) then
    return new;
  elsif tg_table_name = 'listings' and tg_op = 'UPDATE' then
    -- Nested: PL/pgSQL may resolve new.status even when an AND would short-circuit.
    if new.status = 'closed'::public.listing_status then
      return new;  -- archiving (by the owner or a moderator) is always allowed
    end if;
  end if;

  raise exception 'A confirmed GISMA student account is required' using errcode = '42501';
end $$;

revoke all on function private.reject_non_student_actor() from public, anon, authenticated;

-- "a_" prefix: fire with the existing a_suspension_guard triggers, before quotas.
create trigger a_student_guard before insert or update on public.profiles
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.listings
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.housing_details
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.marketplace_details
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.job_details
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.trip_details
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.event_details
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.listing_media
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.saved_listings
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.conversations
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.conversation_members
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.messages
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.reports
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.student_groups
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.student_group_members
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.student_group_messages
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.student_group_files
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.job_applications
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.trip_participants
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.event_participants
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert on public.publisher_requests
  for each row execute function private.reject_non_student_actor();
create trigger a_student_guard before insert or update on public.benefit_redemptions
  for each row execute function private.reject_non_student_actor();
-- Not guarded on purpose: user_blocks (protective), moderation_notices
-- (acknowledging notices), account_suspensions and moderators (staff only).

-- 5. Remove non-students from the student directory --------------------------
-- No JWT here, so the guard above does not fire; stamp_discovery_consent
-- clears the consent timestamp. The guard then stops them re-enabling it.
update public.profiles p
   set is_discoverable = false
 where p.is_discoverable
   and not private.has_gisma_student_email(p.id);

-- 6. Signup gate for Supabase Auth's Before User Created hook ----------------
-- Contract: https://supabase.com/docs/guides/auth/auth-hooks/before-user-created-hook
create function public.hook_require_gisma_signup(event jsonb) returns jsonb
language plpgsql stable set search_path = '' as $$
begin
  if lower(btrim(coalesce(event -> 'user' ->> 'email', ''))) ~ '^[^@[:space:]]+@gisma-student[.]com$' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'Use your GISMA student email address (@gisma-student.com).'));
end $$;

grant execute on function public.hook_require_gisma_signup(jsonb) to supabase_auth_admin;
revoke execute on function public.hook_require_gisma_signup(jsonb) from public, anon, authenticated;

commit;
