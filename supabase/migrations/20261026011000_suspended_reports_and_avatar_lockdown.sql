-- Pipeline-audit follow-ups (2026-10-26).
--
-- 1. Suspended students could file reports for any reason, so a suspended
--    account could flood moderators with retaliatory "spam"/"fraud" reports.
--    They keep the safety path only: harassment and unsafe behaviour.
--
-- 2. The avatars bucket accepted direct client uploads, which keep camera and
--    GPS metadata. Stuora has no avatar feature (profiles show an initial), so
--    the write path is closed instead of left open and unprocessed. Owners can
--    still delete a legacy object, and delete-account still clears the bucket
--    with the service role. avatar_path is no longer client-writable.

create or replace function private.limit_suspended_reports()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if private.is_suspended(new.reporter_id)
     and new.reason not in ('harassment'::public.report_reason, 'unsafe'::public.report_reason) then
    raise exception 'While your account is suspended you can only report harassment or unsafe behaviour'
      using errcode = '42501';
  end if;
  return new;
end $$;
revoke all on function private.limit_suspended_reports() from public, anon, authenticated;

drop trigger if exists reports_suspended_reporter on public.reports;
create trigger reports_suspended_reporter
  before insert on public.reports
  for each row execute function private.limit_suspended_reports();

drop policy if exists "avatars_owner_insert" on storage.objects;
drop policy if exists "avatars_owner_update" on storage.objects;

revoke insert (avatar_path), update (avatar_path) on public.profiles from authenticated;
