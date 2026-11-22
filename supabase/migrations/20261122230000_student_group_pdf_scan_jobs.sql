-- A real PDF scanner must return a clean verdict tied to the exact stored
-- bytes before a document is approved. This migration is SOURCE ONLY.
-- The worker/scanner remain disabled and no external student data is sent.
begin;

alter table public.student_group_files
  add column scan_sha256 text,
  add column scan_engine text,
  add constraint student_group_pdf_approval_requires_scan
    check (
      status <> 'approved' or media_type <> 'application/pdf' or (
        inspection_method = 'antivirus'
        and scan_sha256 ~ '^[0-9a-f]{64}$'
        and scan_engine = 'clamav-http-v1'
        and inspected_at is not null
      )
    );

create table private.student_group_pdf_scan_jobs (
  file_id uuid primary key references public.student_group_files(id) on delete cascade,
  queued_at timestamptz not null default clock_timestamp(),
  attempts integer not null default 0 check (attempts between 0 and 6),
  next_attempt_at timestamptz not null default clock_timestamp(),
  lease_id uuid,
  lease_expires_at timestamptz,
  last_error_code text,
  check ((lease_id is null) = (lease_expires_at is null))
);
alter table private.student_group_pdf_scan_jobs enable row level security;
revoke all on private.student_group_pdf_scan_jobs from public, anon, authenticated;
create index student_group_pdf_scan_ready_idx
  on private.student_group_pdf_scan_jobs (next_attempt_at, queued_at)
  where attempts < 6;

create function private.enqueue_student_group_pdf_scan_job()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.media_type = 'application/pdf' and new.status = 'pending_review' then
    insert into private.student_group_pdf_scan_jobs(file_id) values(new.id)
      on conflict(file_id) do nothing;
  end if;
  return new;
end;
$$;
create trigger student_group_pdf_scan_enqueue
after insert on public.student_group_files
for each row execute function private.enqueue_student_group_pdf_scan_job();
revoke all on function private.enqueue_student_group_pdf_scan_job()
  from public, anon, authenticated;

create function public.claim_student_group_pdf_scan_jobs(p_limit integer default 2)
returns table(file_id uuid, lease_id uuid, object_path text, size_bytes integer)
language plpgsql security definer set search_path = ''
as $$
begin
  return query
  with available as (
    select j.file_id
      from private.student_group_pdf_scan_jobs j
      join public.student_group_files f on f.id = j.file_id
     where j.attempts < 6 and j.next_attempt_at <= clock_timestamp()
       and (j.lease_expires_at is null or j.lease_expires_at < clock_timestamp())
       and f.status = 'pending_review' and f.media_type = 'application/pdf'
     order by j.queued_at, j.file_id
     for update of j skip locked
     limit least(greatest(coalesce(p_limit, 1), 1), 2)
  ),
  claimed as (
    update private.student_group_pdf_scan_jobs j
       set attempts = j.attempts + 1,
           lease_id = gen_random_uuid(),
           lease_expires_at = clock_timestamp() + interval '3 minutes'
      from available a
     where j.file_id = a.file_id
    returning j.file_id, j.lease_id
  )
  select c.file_id,c.lease_id,f.object_path,f.size_bytes
    from claimed c join public.student_group_files f on f.id = c.file_id;
end;
$$;

-- Only the service worker can settle a scan. The scanner engine string and
-- SHA256 fingerprint are tied to a live lease. A malformed verdict never
-- approves the PDF and a failed scan is left private for a bounded retry.
create function public.finish_student_group_pdf_scan(
  p_file uuid, p_lease uuid, p_verdict text, p_sha256 text default null,
  p_engine text default null
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  v_job private.student_group_pdf_scan_jobs%rowtype;
  v_file public.student_group_files%rowtype;
begin
  if p_file is null or p_lease is null
     or p_verdict not in ('clean','malicious','error') then return false; end if;
  select * into v_job from private.student_group_pdf_scan_jobs
   where file_id=p_file for update;
  if not found or v_job.lease_id is distinct from p_lease
     or v_job.lease_expires_at < clock_timestamp() then return false; end if;
  select * into v_file from public.student_group_files
   where id=p_file for update;
  if not found or v_file.status <> 'pending_review'
     or v_file.media_type <> 'application/pdf' then return false; end if;

  if p_verdict = 'error' then
    update private.student_group_pdf_scan_jobs
       set lease_id=null,lease_expires_at=null,
           next_attempt_at=clock_timestamp()
             + (least(3600, 30 * power(2,least(v_job.attempts,6))) * interval '1 second'),
           last_error_code='SCANNER_UNAVAILABLE'
     where file_id=p_file;
    return true;
  end if;
  if p_sha256 is null or p_sha256 !~ '^[0-9a-f]{64}$'
     or p_engine is distinct from 'clamav-http-v1' then
    return false;
  end if;

  update public.student_group_files
     set status = case when p_verdict='clean' then 'approved' else 'blocked' end,
         inspection_method='antivirus',
         inspected_at=clock_timestamp(),
         scan_sha256=p_sha256,
         scan_engine=p_engine
   where id=p_file;
  delete from private.student_group_pdf_scan_jobs where file_id=p_file;
  return true;
end;
$$;

revoke all on function public.claim_student_group_pdf_scan_jobs(integer)
 from public, anon, authenticated;
revoke all on function public.finish_student_group_pdf_scan(uuid,uuid,text,text,text)
 from public, anon, authenticated;
grant execute on function public.claim_student_group_pdf_scan_jobs(integer)
 to service_role;
grant execute on function public.finish_student_group_pdf_scan(uuid,uuid,text,text,text)
 to service_role;

commit;
