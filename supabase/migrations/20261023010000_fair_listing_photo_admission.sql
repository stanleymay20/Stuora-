-- Gen-3 audit N-01 / N-02: fair, owner-verified photo upload admission.
-- Forward-only. Same signature and grants as 20261022190000 (service_role only).
--
-- N-01: the global window was bumped on EVERY call, including calls already
-- refused by the caller's own per-student limits, so one account could exhaust
-- the platform-wide budget for everyone. The global window is now consumed only
-- by requests the student's own limits admit.
--
-- N-02: the per-listing window was keyed by a caller-supplied listing id BEFORE
-- ownership was checked, so anyone could exhaust another student's listing
-- budget. Ownership, kind and status are now verified inside the database
-- before the listing window is touched; a non-owner can only spend their own
-- student budget.
begin;

create or replace function public.consume_listing_photo_attempt(p_student uuid, p_listing uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_student_minute boolean;
  v_student_hour boolean;
begin
  if p_student is null then return false; end if;

  -- 1. The caller's own budget is always charged first. Abuse only ever
  --    exhausts the abuser's own windows.
  v_student_minute := private.bump_listing_photo_attempt('student_minute', p_student::text, 10, interval '1 minute');
  v_student_hour := private.bump_listing_photo_attempt('student_hour', p_student::text, 40, interval '1 hour');
  if not (v_student_minute and v_student_hour) then return false; end if;

  -- 2. A named listing must belong to this student and accept photos. A
  --    foreign or unusable listing id never reaches the shared windows.
  if p_listing is not null and not exists (
    select 1 from public.listings l
     where l.id = p_listing
       and l.owner_id = p_student
       and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
       and l.status = 'active'::public.listing_status
  ) then
    return false;
  end if;

  -- 3. Only admitted, owner-verified requests consume shared capacity.
  if not private.bump_listing_photo_attempt('global_minute', 'all', 60, interval '1 minute') then
    return false;
  end if;
  if p_listing is not null then
    return private.bump_listing_photo_attempt('listing_hour', p_listing::text, 20, interval '1 hour');
  end if;
  return true;
end;
$$;
revoke all on function public.consume_listing_photo_attempt(uuid,uuid) from public, anon, authenticated;
grant execute on function public.consume_listing_photo_attempt(uuid,uuid) to service_role;

commit;
