-- Server-only admission, throttling and caching for the AI assistant gateway
-- and external data providers (Nominatim, Ticketmaster, Adzuna, Bundesagentur).
-- Every function here is callable ONLY by service_role (Edge Functions), after
-- the function itself has validated the student's JWT with Auth.getUser.
--
-- Fairness rule learned from gen-3 finding N-01: shared (global) windows are
-- charged only for requests the student's own windows have admitted, so one
-- account can never exhaust capacity for everyone else.
begin;

create table private.service_request_windows (
  scope text not null check (char_length(scope) between 3 and 60),
  scope_key text not null check (char_length(scope_key) between 1 and 80),
  window_started_at timestamptz not null,
  used integer not null check (used >= 1),
  primary key (scope, scope_key)
);
alter table private.service_request_windows enable row level security;
revoke all on private.service_request_windows from public, anon, authenticated;

create function private.bump_service_window(
  p_scope text, p_scope_key text, p_limit integer, p_window interval
) returns boolean language plpgsql security definer set search_path = '' as $$
declare v_now timestamptz := clock_timestamp(); v_used integer;
begin
  insert into private.service_request_windows(scope, scope_key, window_started_at, used)
  values (p_scope, p_scope_key, v_now, 1)
  on conflict (scope, scope_key) do update set
    window_started_at = case
      when private.service_request_windows.window_started_at + p_window <= v_now
        then v_now else private.service_request_windows.window_started_at end,
    used = case
      when private.service_request_windows.window_started_at + p_window <= v_now
        then 1 else least(private.service_request_windows.used + 1, 2147483647) end
  returning used into v_used;
  return v_used <= p_limit;
end;
$$;
revoke all on function private.bump_service_window(text, text, integer, interval) from public, anon, authenticated;

-- AI assistant: 5/minute and 40/day per student, 5,000/day platform-wide.
create function public.consume_ai_request(p_student uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_student is null or private.is_suspended(p_student) then return false; end if;
  if not private.bump_service_window('ai_student_minute', p_student::text, 5, interval '1 minute') then return false; end if;
  if not private.bump_service_window('ai_student_day', p_student::text, 40, interval '1 day') then return false; end if;
  return private.bump_service_window('ai_global_day', 'all', 5000, interval '1 day');
end;
$$;
revoke all on function public.consume_ai_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_request(uuid) to service_role;

-- External feeds and city lookups: 10/minute and 200/day per student,
-- 120/minute platform-wide (cache hits are served before admission).
create function public.consume_external_data_request(p_student uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if p_student is null or private.is_suspended(p_student) then return false; end if;
  if not private.bump_service_window('ext_student_minute', p_student::text, 10, interval '1 minute') then return false; end if;
  if not private.bump_service_window('ext_student_day', p_student::text, 200, interval '1 day') then return false; end if;
  return private.bump_service_window('ext_global_minute', 'all', 120, interval '1 minute');
end;
$$;
revoke all on function public.consume_external_data_request(uuid) from public, anon, authenticated;
grant execute on function public.consume_external_data_request(uuid) to service_role;

-- OpenStreetMap Nominatim public policy: at most one request per second
-- across the whole application, regardless of Edge replica count.
create table private.nominatim_throttle (
  singleton boolean primary key default true check (singleton),
  last_request_at timestamptz not null default '-infinity'
);
insert into private.nominatim_throttle (singleton) values (true);
alter table private.nominatim_throttle enable row level security;
revoke all on private.nominatim_throttle from public, anon, authenticated;

create function public.acquire_nominatim_slot()
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.nominatim_throttle
     set last_request_at = clock_timestamp()
   where singleton and last_request_at <= clock_timestamp() - interval '1100 milliseconds';
  return found;
end;
$$;
revoke all on function public.acquire_nominatim_slot() from public, anon, authenticated;
grant execute on function public.acquire_nominatim_slot() to service_role;

-- Short-lived provider cache. Providers' terms limit storage, so entries
-- expire (TTL chosen per provider in the Edge code) and payloads are bounded.
create table private.external_cache (
  provider text not null check (provider in ('nominatim', 'ticketmaster', 'adzuna', 'bundesagentur')),
  cache_key text not null check (char_length(cache_key) between 1 and 300),
  payload jsonb not null check (octet_length(payload::text) <= 262144),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (provider, cache_key),
  check (expires_at > fetched_at)
);
create index external_cache_expiry_idx on private.external_cache (expires_at);
alter table private.external_cache enable row level security;
revoke all on private.external_cache from public, anon, authenticated;

create function public.external_cache_get(p_provider text, p_key text)
returns jsonb language sql stable security definer set search_path = '' as $$
  select c.payload from private.external_cache c
   where c.provider = p_provider and c.cache_key = p_key and c.expires_at > now();
$$;
revoke all on function public.external_cache_get(text, text) from public, anon, authenticated;
grant execute on function public.external_cache_get(text, text) to service_role;

create function public.external_cache_put(p_provider text, p_key text, p_payload jsonb, p_ttl_seconds integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if p_ttl_seconds is null or p_ttl_seconds not between 60 and 2592000 then
    raise exception 'Cache TTL must be between 1 minute and 30 days' using errcode = '22023';
  end if;
  insert into private.external_cache(provider, cache_key, payload, fetched_at, expires_at)
  values (p_provider, p_key, p_payload, now(), now() + make_interval(secs => p_ttl_seconds))
  on conflict (provider, cache_key) do update
    set payload = excluded.payload, fetched_at = excluded.fetched_at, expires_at = excluded.expires_at;
  -- Opportunistic, bounded purge keeps the table small without a scheduler.
  delete from private.external_cache
   where ctid in (select ctid from private.external_cache where expires_at <= now() limit 100);
end;
$$;
revoke all on function public.external_cache_put(text, text, jsonb, integer) from public, anon, authenticated;
grant execute on function public.external_cache_put(text, text, jsonb, integer) to service_role;

commit;
