-- Stuora group-file intake, staging-first: privileged durable admission and
-- atomic commit. Client identities are verified by the Edge Function first.
-- Both RPCs are callable ONLY by the server-held service_role. No public
-- Storage INSERT/SELECT policy or production deployment is created.
begin;

create table private.student_group_file_upload_limits (
  actor_id uuid primary key references public.profiles(id) on delete cascade,
  window_started_at timestamptz not null default now(),
  used integer not null default 1 check (used >= 1)
);
alter table private.student_group_file_upload_limits enable row level security;
revoke all on private.student_group_file_upload_limits from public, anon, authenticated;

create function public.claim_student_group_file_upload(p_actor uuid, p_group uuid)
returns boolean language plpgsql security definer set search_path = ''
as $$
declare
  v_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if p_actor is null or p_group is null then return false; end if;
  -- Group row lock serializes join/removal and group deletion with admission.
  perform 1 from public.student_groups g where g.id = p_group for share;
  if not found then return false; end if;
  perform 1 from public.profiles p where p.id = p_actor
    and p.account_kind = 'student' for update;
  if not found then return false; end if;
  if not exists (
    select 1 from public.student_group_members m
    where m.group_id = p_group and m.user_id = p_actor
  ) or exists (
    select 1 from public.student_group_bans b
    where b.group_id = p_group and b.user_id = p_actor
  ) then return false; end if;

  -- Durable committed accounting BEFORE multipart parsing/decoding. A failed
  -- or oversized request still uses one of twelve hourly attempts.
  insert into private.student_group_file_upload_limits(actor_id,window_started_at,used)
  values (p_actor,v_now,1)
  on conflict (actor_id) do update set
    window_started_at = case
      when private.student_group_file_upload_limits.window_started_at <= v_now - interval '1 hour'
      then v_now else private.student_group_file_upload_limits.window_started_at end,
    used = case
      when private.student_group_file_upload_limits.window_started_at <= v_now - interval '1 hour'
      then 1 else least(private.student_group_file_upload_limits.used + 1, 2147483647) end
  returning used into v_count;
  return v_count <= 12;
end;
$$;

create function public.commit_student_group_file_upload(
  p_actor uuid, p_group uuid, p_file uuid, p_original_name text,
  p_size integer, p_media_type text, p_object_path text, p_status text
) returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_ext text;
  v_id uuid;
begin
  if p_actor is null or p_group is null or p_file is null
     or p_original_name is null or p_size not between 1 and 5242880 then
    raise exception 'Invalid private attachment' using errcode = '22023';
  end if;
  if (p_media_type = 'image/webp' and p_status = 'approved') then
    v_ext := 'webp';
  elsif (p_media_type = 'application/pdf' and p_status = 'pending_review') then
    v_ext := 'pdf';
  else
    raise exception 'Untrusted or unsupported attachment state' using errcode = '22023';
  end if;
  if p_object_path is distinct from p_group::text || '/' || p_file::text || '.' || v_ext
    or char_length(p_original_name) not between 1 and 120
    or btrim(p_original_name) <> p_original_name
    or position('/' in p_original_name) <> 0
    or position(chr(92) in p_original_name) <> 0 then
    raise exception 'Invalid attachment filename or path' using errcode = '22023';
  end if;

  perform 1 from public.student_groups g where g.id = p_group for share;
  if not found then raise exception 'Group unavailable' using errcode = '42501'; end if;
  if not exists (
    select 1 from public.student_group_members m
    where m.group_id = p_group and m.user_id = p_actor
  ) or exists (
    select 1 from public.student_group_bans b
    where b.group_id = p_group and b.user_id = p_actor
  ) then raise exception 'Group membership unavailable' using errcode = '42501'; end if;
  if (select count(*) from public.student_group_files f
      where f.group_id = p_group and f.uploader_id = p_actor
        and f.created_at >= now() - interval '24 hours') >= 20 then
    raise exception 'Private file upload limit reached' using errcode = 'P0001';
  end if;
  insert into public.student_group_files (
    id,group_id,uploader_id,original_name,object_path,media_type,
    size_bytes,status,inspection_method,inspected_at
  ) values (
    p_file,p_group,p_actor,p_original_name,p_object_path,p_media_type,
    p_size,p_status,
    case when p_status = 'approved' then 'trusted-image-transcode' else null end,
    case when p_status = 'approved' then now() else null end
  ) returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.claim_student_group_file_upload(uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.claim_student_group_file_upload(uuid,uuid) to service_role;
revoke all on function public.commit_student_group_file_upload(
 uuid,uuid,uuid,text,integer,text,text,text
) from public, anon, authenticated;
grant execute on function public.commit_student_group_file_upload(
 uuid,uuid,uuid,text,integer,text,text,text
) to service_role;

commit;
