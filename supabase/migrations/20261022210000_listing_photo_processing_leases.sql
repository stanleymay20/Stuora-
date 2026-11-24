-- Durable, expiring admission for CPU-intensive trusted media processing.
-- Independent RPC commit + global transaction advisory lock prevent parallel
-- decode saturation. Existing direct client uploads remain unchanged.
begin;
create table private.listing_photo_processing_leases (
  request_id uuid primary key,
  student_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  constraint positive_lease check (expires_at > created_at)
);
create index listing_photo_processing_expiry_idx
  on private.listing_photo_processing_leases (expires_at);
alter table private.listing_photo_processing_leases enable row level security;
revoke all on private.listing_photo_processing_leases from public, anon, authenticated;

create function public.acquire_listing_photo_processing_lease(p_student uuid, p_request uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_now timestamptz := clock_timestamp();
  v_total integer;
begin
  if p_student is null or p_request is null then return false; end if;
  -- Fixed advisory key is shared across all Edge replicas.
  perform pg_advisory_xact_lock(904602121230444::bigint);
  delete from private.listing_photo_processing_leases where expires_at <= v_now;
  if exists (select 1 from private.listing_photo_processing_leases
             where student_id = p_student) then
    return false; -- at most ONE concurrent decoder per student
  end if;
  select count(*) into v_total from private.listing_photo_processing_leases;
  if v_total >= 4 then return false; end if; -- globally at most FOUR workers
  insert into private.listing_photo_processing_leases
      (student_id,request_id,created_at,expires_at)
  values (p_student,p_request,v_now,v_now + interval '3 minutes')
  on conflict (request_id) do nothing;
  return found;
end;
$$;
revoke all on function public.acquire_listing_photo_processing_lease(uuid,uuid)
 from public, anon, authenticated;
grant execute on function public.acquire_listing_photo_processing_lease(uuid,uuid)
 to service_role;

create function public.release_listing_photo_processing_lease(p_student uuid,p_request uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  delete from private.listing_photo_processing_leases
   where student_id=p_student and request_id=p_request;
  return found;
end;
$$;
revoke all on function public.release_listing_photo_processing_lease(uuid,uuid)
 from public, anon, authenticated;
grant execute on function public.release_listing_photo_processing_lease(uuid,uuid)
 to service_role;
commit;
