-- ROLLBACK-ONLY staging dry run of 20261124130000_student_access_audit_hardening.
-- Applies the migration body inside a transaction, checks its behaviour with
-- SIMULATED identities created in the transaction, then raises the results so
-- nothing persists. Run 24 Nov 2026 on uptjcspizukpjcoayhtn: 8/8 passed, staging
-- unchanged afterwards. Never execute in production.
begin;

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

revoke update on public.trip_participants from authenticated;

create index activity_reviews_reviewed_by_idx on private.activity_reviews (reviewed_by);

create temporary table _qa on commit drop as select gen_random_uuid() a, gen_random_uuid() b, gen_random_uuid() o,
  gen_random_uuid() la, gen_random_uuid() lo, substr(md5(random()::text),1,8) tag;
create temporary table _r (n serial, step text, ok boolean, detail text) on commit drop;
grant select on _qa to authenticated; grant select, insert on _r to authenticated; grant usage on sequence _r_n_seq to authenticated;
insert into auth.users (id, email, email_confirmed_at, aud, role)
select a, 'qa-ha-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select b, 'qa-hb-'||tag||'@gisma-student.com', now(), 'authenticated', 'authenticated' from _qa union all
select o, 'qa-ho-'||tag||'@example.invalid', now(), 'authenticated', 'authenticated' from _qa;
insert into public.profiles (id, display_name, city)
select a, 'QA A', 'Berlin' from _qa union all select b, 'QA B', 'Berlin' from _qa union all select o, 'QA O', 'Berlin' from _qa;
insert into public.listings (id, owner_id, kind, status, title, city, price_cents)
select la, a, 'marketplace'::public.listing_kind, 'active'::public.listing_status, 'QA student lamp', 'Berlin', 100 from _qa union all
select lo, o, 'marketplace'::public.listing_kind, 'active'::public.listing_status, 'QA legacy lamp', 'Berlin', 100 from _qa;
insert into public.marketplace_details (listing_id) select la from _qa union all select lo from _qa;
select set_config('request.jwt.claim.sub', (select b::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.listings where id = (select la from _qa);
  insert into _r(step, ok, detail) values ('GISMA student sees eligible owner listing', n = 1, n::text);
  select count(*) into n from public.listings where id = (select lo from _qa);
  insert into _r(step, ok, detail) values ('GISMA student no longer sees non-GISMA legacy listing', n = 0, n::text);
  select count(*) into n from public.marketplace_details where listing_id = (select lo from _qa);
  insert into _r(step, ok, detail) values ('Legacy listing details hidden too', n = 0, n::text);
end $$;
reset role;
select set_config('request.jwt.claim.sub', (select o::text from _qa), true);
set local role authenticated;
do $$ declare n int; begin
  select count(*) into n from public.listings where id = (select lo from _qa);
  insert into _r(step, ok, detail) values ('Legacy owner still sees own listing', n = 1, n::text);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
  insert into _r(step, ok, detail) values ('Photo admission refuses non-GISMA owner',
    not public.consume_listing_photo_attempt((select o from _qa), (select lo from _qa)), 'ok');
  insert into _r(step, ok, detail) values ('Photo admission allows GISMA owner',
    public.consume_listing_photo_attempt((select a from _qa), (select la from _qa)), 'ok');
  insert into _r(step, ok, detail) values ('Participants cannot update trip_participants.trip_listing_id',
    not has_column_privilege('authenticated', 'public.trip_participants', 'trip_listing_id', 'UPDATE'), 'ok');
  insert into _r(step, ok, detail) values ('Policy helper not callable by anon',
    not has_function_privilege('anon', 'private.is_eligible_listing_owner(uuid)', 'execute'), 'ok');
end $$;
do $$ begin
  raise exception 'STUORA_QA_RESULT %', (select json_build_object('passed', count(*) filter (where ok), 'failed', count(*) filter (where not ok),
    'failures', coalesce(json_agg(json_build_object('step', step, 'detail', detail)) filter (where not ok), '[]'::json),
    'steps', json_agg(step order by n)) from _r);
end $$;
rollback;
