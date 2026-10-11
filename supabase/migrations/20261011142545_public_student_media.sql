create table if not exists public.listing_media (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  object_path text not null unique,
  sort_order smallint not null default 0 check (sort_order between 0 and 20),
  created_at timestamptz not null default now(),
  constraint listing_media_path_shape check (object_path !~ '(^|/)\.\.?(/|$)')
);

create index if not exists listing_media_listing_idx on public.listing_media(listing_id, sort_order, created_at);

alter table public.listing_media enable row level security;

revoke all on public.listing_media from anon, authenticated;
grant select on public.listing_media to anon, authenticated;
grant insert, delete on public.listing_media to authenticated;

drop policy if exists "listing_media_read_visible" on public.listing_media;
create policy "listing_media_read_visible"
on public.listing_media for select
to anon, authenticated
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id
      and (l.status = 'active'::public.listing_status or l.owner_id = (select auth.uid()))
  )
);

drop policy if exists "listing_media_insert_owned" on public.listing_media;
create policy "listing_media_insert_owned"
on public.listing_media for insert
to authenticated
with check (
  split_part(object_path, '/', 1) = (select auth.uid())::text
  and split_part(object_path, '/', 2) = listing_id::text
  and exists (
    select 1 from public.listings l
    where l.id = listing_id
      and l.owner_id = (select auth.uid())
      and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
  )
);

drop policy if exists "listing_media_delete_owned" on public.listing_media;
create policy "listing_media_delete_owned"
on public.listing_media for delete
to authenticated
using (
  exists (
    select 1 from public.listings l
    where l.id = listing_id and l.owner_id = (select auth.uid())
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/jpeg','image/png','image/webp']::text[]),
  ('listing-media', 'listing-media', true, 5242880, array['image/jpeg','image/png','image/webp']::text[])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "avatars_owner_select" on storage.objects;
create policy "avatars_owner_select"
on storage.objects for select
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "avatars_owner_insert" on storage.objects;
create policy "avatars_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and array_length(storage.foldername(name), 1) = 1
  and storage.filename(name) = 'avatar'
);

drop policy if exists "avatars_owner_update" on storage.objects;
create policy "avatars_owner_update"
on storage.objects for update
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and storage.filename(name) = 'avatar')
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and storage.filename(name) = 'avatar');

drop policy if exists "avatars_owner_delete" on storage.objects;
create policy "avatars_owner_delete"
on storage.objects for delete
to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text and storage.filename(name) = 'avatar');

drop policy if exists "listing_media_owner_select" on storage.objects;
create policy "listing_media_owner_select"
on storage.objects for select
to authenticated
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "listing_media_owner_insert" on storage.objects;
create policy "listing_media_owner_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'listing-media'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.owner_id = (select auth.uid())
      and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
  )
);

drop policy if exists "listing_media_owner_update" on storage.objects;
create policy "listing_media_owner_update"
on storage.objects for update
to authenticated
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'listing-media'
  and array_length(storage.foldername(name), 1) = 2
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.listings l
    where l.id::text = (storage.foldername(name))[2]
      and l.owner_id = (select auth.uid())
      and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
  )
);

drop policy if exists "listing_media_owner_delete" on storage.objects;
create policy "listing_media_owner_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'listing-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
