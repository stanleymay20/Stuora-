-- Rollback for 20261124130000_student_access_audit_hardening.sql (staging only).
-- Restores the definitions that 20261124100000-20261124120000 left in place.
begin;
drop index private.activity_reviews_reviewed_by_idx;
grant update on public.trip_participants to authenticated;

drop policy listings_read_student_catalogue_or_owned on public.listings;
create policy listings_read_student_catalogue_or_owned on public.listings for select to authenticated
  using (owner_id = (select auth.uid())
         or ((select private.current_user_is_gisma_student())
             and status = 'active'::public.listing_status
             and review_status in ('not_required', 'approved')));
drop function private.is_eligible_listing_owner(uuid);

create or replace function public.consume_listing_photo_attempt(p_student uuid, p_listing uuid default null::uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
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
$function$;
commit;
