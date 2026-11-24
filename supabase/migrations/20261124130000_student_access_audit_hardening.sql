-- DRAFT FOR STAGING REVIEW. Do not apply to production (mljmifovcthvtuquvyzf).
-- Requires 20261124100000, 20261124110000 and 20261124120000.
--
-- Fixes from the 0.1.7 security audit (24 Nov 2026):
--   A-01 Listing photo uploads: the listing-photo-intake Edge Function admits an
--        upload through consume_listing_photo_attempt, which checked ownership
--        but not GISMA eligibility. A legacy non-GISMA owner could still add
--        photos to an old listing. The quota gate now requires an eligible,
--        unsuspended student before charging any shared budget.
--   A-02 Student-only catalogue: a listing published by an account that is no
--        longer an eligible student (non-GISMA legacy, rejected) stayed visible
--        to students. The catalogue now also requires an eligible owner.
--   A-03 trip_participants granted UPDATE on trip_listing_id without any UPDATE
--        policy. RLS blocks it today; revoke the grant so a future policy cannot
--        let a participant move onto an unapproved trip.
--   A-04 Index the reviewer foreign key on the private review audit table.
begin;

-- A-01 ----------------------------------------------------------------------
create or replace function public.consume_listing_photo_attempt(p_student uuid, p_listing uuid default null::uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_student_minute boolean;
  v_student_hour boolean;
begin
  if p_student is null then return false; end if;
  -- 0. Only eligible, unsuspended GISMA students may add student photos.
  if not private.is_gisma_student(p_student) then return false; end if;

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
$function$;

-- A-02 ----------------------------------------------------------------------
-- Policy helper: called from RLS with the caller's privileges, so it must be
-- executable by authenticated. It only answers "is this listing's owner an
-- eligible student", and the private schema is not exposed through the API.
create function private.is_eligible_listing_owner(p_owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_gisma_student_account(p_owner);
$$;
revoke all on function private.is_eligible_listing_owner(uuid) from public, anon;
grant execute on function private.is_eligible_listing_owner(uuid) to authenticated;

drop policy listings_read_student_catalogue_or_owned on public.listings;
create policy listings_read_student_catalogue_or_owned on public.listings for select to authenticated
  using (owner_id = (select auth.uid())
         or ((select private.current_user_is_gisma_student())
             and status = 'active'::public.listing_status
             and review_status in ('not_required', 'approved')
             and private.is_eligible_listing_owner(owner_id)));

-- A-03 ----------------------------------------------------------------------
revoke update on public.trip_participants from authenticated;

-- A-04 ----------------------------------------------------------------------
create index activity_reviews_reviewed_by_idx on private.activity_reviews (reviewed_by);

commit;
