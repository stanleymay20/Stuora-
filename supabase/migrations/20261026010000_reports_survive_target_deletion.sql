-- Account deletion was refused for every student who had ever been reported.
--
-- reports_check (from the first foundation migration) demanded
-- listing_id IS NOT NULL OR reported_user_id IS NOT NULL on every row, at all
-- times. Both columns are ON DELETE SET NULL, so when a reported student deletes
-- their account the cascade nulls them and the whole deletion fails with 23514.
-- The privacy notice promises that reports about a deleted account are kept
-- (with their content snapshot) for abuse handling, so the row must be able to
-- outlive its target.
--
-- A target is still required when a report is filed: enforced on INSERT only.

alter table public.reports drop constraint if exists reports_check;

create or replace function private.require_report_target()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.listing_id is null and new.reported_user_id is null
     and new.group_message_id is null and new.message_id is null then
    raise exception 'A report needs something to report' using errcode = '23514';
  end if;
  return new;
end $$;
revoke all on function private.require_report_target() from public, anon, authenticated;

drop trigger if exists reports_require_target on public.reports;
create trigger reports_require_target
  before insert on public.reports
  for each row execute function private.require_report_target();
