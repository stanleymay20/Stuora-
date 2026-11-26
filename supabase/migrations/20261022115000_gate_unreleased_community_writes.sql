-- Disable unfinished authenticated community publishing and participation
-- on fresh/staging databases WITHOUT losing the canonical PR18 rate-limit,
-- messaging block or abuse ledger objects.
-- This is deliberately reversible by a future reviewed release migration.
begin;

revoke execute on function public.save_community_listing(uuid,public.listing_kind,text,text,text,integer,jsonb) from public,anon,authenticated;
revoke execute on function private.save_community_listing_impl(uuid,public.listing_kind,text,text,text,integer,jsonb) from public,anon,authenticated;
revoke execute on function public.listing_participation(uuid,text,text) from public,anon,authenticated;
revoke execute on function private.listing_participation_impl(uuid,text,text) from public,anon,authenticated;
revoke execute on function public.review_job_application(uuid,public.application_status) from public,anon,authenticated;
revoke execute on function private.review_job_application_impl(uuid,public.application_status) from public,anon,authenticated;

-- Authenticated direct parent-table writes must not reopen the gated
-- job, trip, event or community-post supply path. Service operations
-- executing without a student JWT remain unaffected.
create or replace function private.enforce_listing_integrity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.currency is distinct from 'EUR' then
    raise exception 'Only EUR listings are supported' using errcode = '23514';
  end if;
  if auth.uid() is not null and new.kind not in ('housing'::public.listing_kind,'marketplace'::public.listing_kind) then
    raise exception 'This category is not yet accepting student submissions' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_listing_integrity() from public,anon,authenticated;

commit;
