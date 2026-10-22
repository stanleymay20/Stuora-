-- Staging-compatible preparatory guard: enforce at most six photo metadata
-- records per listing under concurrent direct API and Edge writes.
-- Does NOT enable the new Edge function or alter existing public bucket access.
begin;

create function private.guard_listing_media_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  -- Serialize competing photo inserts before checking counts. This same
  -- transaction lock is acquired by REST and privileged Edge writes.
  perform pg_advisory_xact_lock(hashtextextended(new.listing_id::text, 973101));
  -- Hold a parent row lock until photo metadata commits. FOR SHARE blocks
  -- concurrent listing archive, ownership changes and parent deletion.
  -- Validate AFTER both locks so an archive cannot race the status check.
  perform 1 from public.listings l
   where l.id = new.listing_id
     and l.owner_id::text = split_part(new.object_path, '/', 1)
     and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
     and l.status in ('active'::public.listing_status, 'draft'::public.listing_status)
     and split_part(new.object_path, '/', 2) = new.listing_id::text
     and split_part(new.object_path, '/', 3) <> ''
     and split_part(new.object_path, '/', 4) = ''
   for share;
  if not found then
    raise exception 'Photo listing ownership or status unavailable'
      using errcode = '23514';
  end if;
  select count(*) into v_count
    from public.listing_media m
   where m.listing_id = new.listing_id
     and (tg_op <> 'UPDATE' or m.id <> new.id);
  if v_count >= 6 then
    raise exception 'Listing may contain at most six photos'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists listing_media_six_photo_guard on public.listing_media;
create trigger listing_media_six_photo_guard
before insert or update of listing_id, object_path on public.listing_media
for each row execute function private.guard_listing_media_count();

revoke all on function private.guard_listing_media_count()
  from public, anon, authenticated;

commit;
