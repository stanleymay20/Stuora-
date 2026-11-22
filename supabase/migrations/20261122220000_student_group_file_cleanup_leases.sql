-- Private group object cleanup: durable leases, bounded retry and a
-- service-role-only orphan enqueue path. Source-only; not deployed.
begin;

alter table private.student_group_file_cleanup
  add column attempts integer not null default 0 check (attempts between 0 and 8),
  add column next_attempt_at timestamptz not null default now(),
  add column lease_id uuid,
  add column lease_expires_at timestamptz,
  add column last_error_code text,
  add column updated_at timestamptz not null default now(),
  add constraint group_file_cleanup_lease_pair
    check ((lease_id is null) = (lease_expires_at is null));
create index student_group_file_cleanup_ready_idx
  on private.student_group_file_cleanup (next_attempt_at, queued_at)
  where attempts < 8;

-- Intake may have stored an object before a downstream metadata commit fails.
-- A failed immediate Storage deletion must be persistently queued, not merely
-- written to a log. UUID-only paths prevent caller-selected targets.
create function public.enqueue_student_group_file_orphan(p_object_path text)
returns boolean language plpgsql security definer set search_path = ''
as $$
begin
  if p_object_path is null or
     p_object_path !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.](pdf|webp)$'
     or exists (select 1 from public.student_group_files f
                where f.object_path = p_object_path) then
    return false;
  end if;
  insert into private.student_group_file_cleanup (object_path)
  values (p_object_path) on conflict (object_path) do nothing;
  return true;
end;
$$;

-- SKIP LOCKED leases are resistant to concurrent schedulers and crashed
-- workers. Only up to four objects are handed out per invocation.
create function public.claim_student_group_file_cleanup(p_batch integer default 4)
returns table(object_path text, lease_id uuid)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with candidates as (
    select q.object_path
      from private.student_group_file_cleanup q
     where q.attempts < 8
       and q.next_attempt_at <= clock_timestamp()
       and (q.lease_expires_at is null or q.lease_expires_at < clock_timestamp())
       and not exists (
         select 1 from public.student_group_files f
          where f.object_path = q.object_path
       )
     order by q.queued_at, q.object_path
     for update of q skip locked
     limit least(greatest(coalesce(p_batch, 1), 1), 4)
  )
  update private.student_group_file_cleanup q
     set lease_id = gen_random_uuid(),
         lease_expires_at = clock_timestamp() + interval '5 minutes',
         attempts = q.attempts + 1,
         updated_at = clock_timestamp()
    from candidates c
   where q.object_path = c.object_path
  returning q.object_path, q.lease_id;
end;
$$;

-- Success acknowledges only the live lease after the Storage service has
-- reported removal. Failure releases it with capped exponential retry.
-- Eight attempts require operator investigation; never silently erase work.
create function public.finish_student_group_file_cleanup(
  p_object_path text, p_lease_id uuid, p_removed boolean,
  p_error_code text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_found boolean;
begin
  if p_object_path is null or p_lease_id is null or p_removed is null then
    return false;
  end if;
  if p_removed then
    delete from private.student_group_file_cleanup q
      where q.object_path = p_object_path
        and q.lease_id = p_lease_id
        and q.lease_expires_at >= clock_timestamp()
        and not exists (
          select 1 from public.student_group_files f
           where f.object_path = q.object_path
        );
    return found;
  end if;

  update private.student_group_file_cleanup q
     set lease_id = null,
         lease_expires_at = null,
         next_attempt_at = clock_timestamp()
           + (least(3600, (30 * power(2, least(q.attempts, 7)))) * interval '1 second'),
         last_error_code = case
           when p_error_code ~ '^[A-Z0-9_]{1,40}$' then p_error_code
           else 'STORAGE_REMOVE_FAILED' end,
         updated_at = clock_timestamp()
   where q.object_path = p_object_path
     and q.lease_id = p_lease_id
     and q.lease_expires_at >= clock_timestamp();
  return found;
end;
$$;

revoke all on function public.enqueue_student_group_file_orphan(text)
  from public, anon, authenticated;
revoke all on function public.claim_student_group_file_cleanup(integer)
  from public, anon, authenticated;
revoke all on function public.finish_student_group_file_cleanup(text, uuid, boolean, text)
  from public, anon, authenticated;

grant execute on function public.enqueue_student_group_file_orphan(text) to service_role;
grant execute on function public.claim_student_group_file_cleanup(integer) to service_role;
grant execute on function public.finish_student_group_file_cleanup(text, uuid, boolean, text) to service_role;

commit;
