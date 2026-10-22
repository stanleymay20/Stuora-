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
  if tg_op = 'UPDATE' and new.listing_id = old.listing_id then
    return new;
  end if;
  -- The service-role Edge writer bypasses table RLS, so trigger-level
  -- ownership and path validation are mandatory at the actual commit.
  if split_part(new.object_path, '/', 1) = ''
     or split_part(new.object_path, '/', 2) <> new.listing_id::text
     or not exists (
       select 1 from public.listings l
       where l.id = new.listing_id
         and l.owner_id::text = split_part(new.object_path, '/', 1)
         and l.kind in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
         and l.status in ('active'::public.listing_status, 'draft'::public.listing_status)
     ) then
    raise exception 'Photo listing ownership or status unavailable'
      using errcode = '23514';
  end if;
  -- Lock by logical parent, not object filename. An advisory transaction lock
  -- serializes both direct REST and privileged Edge inserts for this listing.
  perform pg_advisory_xact_lock(hashtextextended(new.listing_id::text, 973101));
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
before insert or update of listing_id on public.listing_media
for each row execute function private.guard_listing_media_count();

revoke all on function private.guard_listing_media_count()
  from public, anon, authenticated;

commit;
