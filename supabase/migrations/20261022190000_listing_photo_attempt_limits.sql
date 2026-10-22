-- Server-side, durable attempt admission for the DISABLED trusted-media Edge path.
-- The initial public Storage client remains unchanged; deployment is deferred.
-- A successful standalone RPC commits counts even if parsing/transcoding fails.
begin;
create table private.listing_photo_attempt_windows (
  scope text not null check (scope in ('global_minute','student_minute','student_hour','listing_hour')),
  scope_key text not null,
  window_started_at timestamptz not null,
  used integer not null check (used >= 1),
  primary key (scope, scope_key)
);
alter table private.listing_photo_attempt_windows enable row level security;
revoke all on private.listing_photo_attempt_windows from public, anon, authenticated;

create function private.bump_listing_photo_attempt(
  p_scope text, p_scope_key text, p_limit integer, p_window interval
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_used integer;
begin
  insert into private.listing_photo_attempt_windows(scope,scope_key,window_started_at,used)
  values(p_scope,p_scope_key,v_now,1)
  on conflict (scope,scope_key) do update set
    window_started_at = case
      when private.listing_photo_attempt_windows.window_started_at + p_window <= v_now
        then v_now else private.listing_photo_attempt_windows.window_started_at end,
    used = case
      when private.listing_photo_attempt_windows.window_started_at + p_window <= v_now
        then 1 else least(private.listing_photo_attempt_windows.used + 1, 2147483647) end
  returning used into v_used;
  return v_used <= p_limit;
end;
$$;
revoke all on function private.bump_listing_photo_attempt(text,text,integer,interval)
  from public, anon, authenticated;

-- This wrapper is callable ONLY with the server-held service role, after
-- Auth.getUser has validated the JWT. Never accept student ID from the client.
-- Every request consumes global and user budget; listing-specific budget is
-- consumed only when global/user admission remains available.
create function public.consume_listing_photo_attempt(p_student uuid, p_listing uuid default null)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_global boolean;
  v_student_minute boolean;
  v_student_hour boolean;
  v_listing boolean := true;
begin
  if p_student is null then return false; end if;
  v_global := private.bump_listing_photo_attempt('global_minute','all',60,interval '1 minute');
  v_student_minute := private.bump_listing_photo_attempt('student_minute',p_student::text,10,interval '1 minute');
  v_student_hour := private.bump_listing_photo_attempt('student_hour',p_student::text,40,interval '1 hour');
  if v_global and v_student_minute and v_student_hour and p_listing is not null then
    v_listing := private.bump_listing_photo_attempt('listing_hour',p_listing::text,20,interval '1 hour');
  end if;
  return v_global and v_student_minute and v_student_hour and v_listing;
end;
$$;
revoke all on function public.consume_listing_photo_attempt(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.consume_listing_photo_attempt(uuid,uuid) to service_role;
commit;
