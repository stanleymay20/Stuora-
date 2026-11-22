-- Stuora group files: private, review-gated metadata and storage groundwork.
-- No client uploads, public URLs, Storage SELECT policy or production activation.
-- A future trusted scanner/intake must set status=approved after verification.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'stuora-group-files', 'stuora-group-files', false, 5242880,
  array['application/pdf','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table public.student_group_files (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.student_groups(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id) on delete cascade,
  original_name text not null
    check (char_length(original_name) between 1 and 120
      and octet_length(original_name) <= 255
      and btrim(original_name) = original_name
      and position('/' in original_name) = 0
      and position(chr(92) in original_name) = 0),
  object_path text not null unique
    check (object_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}[.](pdf|webp)$'
      and split_part(object_path, '/', 1) = group_id::text),
  media_type text not null check (media_type in ('application/pdf','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  -- Pending uploads are neither downloadable nor visible to other members.
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','blocked')),
  inspection_method text,
  inspected_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    status <> 'approved'
    or (inspection_method in ('antivirus','trusted-image-transcode') and inspected_at is not null)
  ),
  check (media_type = 'application/pdf' or object_path like '%.webp'),
  check (media_type = 'image/webp' or object_path like '%.pdf')
);
create index student_group_files_group_time_idx
  on public.student_group_files (group_id, created_at desc, id desc);
create index student_group_files_owner_idx
  on public.student_group_files (uploader_id, created_at desc);

alter table public.student_group_files enable row level security;
revoke all on public.student_group_files from public, anon, authenticated;
grant select on public.student_group_files to authenticated;

-- Require an active membership for BOTH the object's group and the user.
-- Never expose an approved file's metadata to nonmembers or former members.
create policy student_group_files_visible_to_current_members
  on public.student_group_files
  for select to authenticated
  using (
    exists (
      select 1 from public.student_group_members as m
      where m.group_id = student_group_files.group_id
        and m.user_id = (select auth.uid())
    )
    and (
      status = 'approved'
      or (status = 'pending_review' and uploader_id = (select auth.uid()))
    )
  );

-- A future service-only attachment processor will insert/update metadata.
-- No INSERT / UPDATE / DELETE / SELECT policies are created for this bucket
-- on storage.objects. Therefore clients cannot upload, list, sign or download
-- any objects directly. A vetted download Edge gateway must re-authenticate
-- and recheck membership on every request before streaming approved bytes.
-- Do NOT switch this bucket to public or add a blanket authenticated policy.

-- Cascading group deletion also queues object removal. Workers may consume
-- this internal queue after the reviewed secure-media release; objects remain
-- private and inaccessible in the meantime.
create table private.student_group_file_cleanup (
  object_path text primary key,
  queued_at timestamptz not null default now()
);
alter table private.student_group_file_cleanup enable row level security;
revoke all on private.student_group_file_cleanup from public, anon, authenticated;

create function private.queue_student_group_file_cleanup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.student_group_file_cleanup (object_path)
    values (old.object_path)
    on conflict (object_path) do nothing;
  return old;
end;
$$;
create trigger student_group_files_queue_cleanup
after delete on public.student_group_files
for each row execute function private.queue_student_group_file_cleanup();
revoke all on function private.queue_student_group_file_cleanup()
  from public, anon, authenticated;

commit;

      and split_part(object_path, '/', 1) = group_id::text),
  media_type text not null check (media_type in ('application/pdf','image/webp')),
  size_bytes integer not null check (size_bytes between 1 and 5242880),
  -- Pending uploads are neither downloadable nor visible to other members.
  status text not null default 'pending_review'
    check (status in ('pending_review','approved','blocked')),
  inspection_method text,
  inspected_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    status <> 'approved'
    or (inspection_method in ('antivirus','trusted-image-transcode') and inspected_at is not null)
  ),
  check (media_type = 'application/pdf' or object_path like '%.webp'),
  check (media_type = 'image/webp' or object_path like '%.pdf')
);
create index student_group_files_group_time_idx
  on public.student_group_files (group_id, created_at desc, id desc);
create index student_group_files_owner_idx
  on public.student_group_files (uploader_id, created_at desc);

alter table public.student_group_files enable row level security;
revoke all on public.student_group_files from public, anon, authenticated;
grant select on public.student_group_files to authenticated;

-- Require an active membership for BOTH the object's group and the user.
-- Never expose an approved file's metadata to nonmembers or former members.
create policy student_group_files_visible_to_current_members
  on public.student_group_files
  for select to authenticated
  using (
    exists (
      select 1 from public.student_group_members as m
      where m.group_id = student_group_files.group_id
        and m.user_id = (select auth.uid())
    )
    and (
      status = 'approved'
      or (status = 'pending_review' and uploader_id = (select auth.uid()))
    )
  );

-- A future service-only attachment processor will insert/update metadata.
-- No INSERT / UPDATE / DELETE / SELECT policies are created for this bucket
-- on storage.objects. Therefore clients cannot upload, list, sign or download
-- any objects directly. A vetted download Edge gateway must re-authenticate
-- and recheck membership on every request before streaming approved bytes.
-- Do NOT switch this bucket to public or add a blanket authenticated policy.

-- Cascading group deletion also queues object removal. Workers may consume
-- this internal queue after the reviewed secure-media release; objects remain
-- private and inaccessible in the meantime.
create table private.student_group_file_cleanup (
  object_path text primary key,
  queued_at timestamptz not null default now()
);
alter table private.student_group_file_cleanup enable row level security;
revoke all on private.student_group_file_cleanup from public, anon, authenticated;

create function private.queue_student_group_file_cleanup()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into private.student_group_file_cleanup (object_path)
    values (old.object_path)
    on conflict (object_path) do nothing;
  return old;
end;
$$;
create trigger student_group_files_queue_cleanup
after delete on public.student_group_files
for each row execute function private.queue_student_group_file_cleanup();
revoke all on function private.queue_student_group_file_cleanup()
  from public, anon, authenticated;

commit;
