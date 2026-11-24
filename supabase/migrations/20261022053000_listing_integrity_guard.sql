-- Stuora P0: prevent direct Data API writes from forging feed ordering or
-- publishing incomplete housing/marketplace listings.
-- Independent of the existing private.limit_student_actions rate-limit trigger.
-- Existing rows are unchanged; forward-only and staging-first.
begin;

create function private.enforce_listing_integrity()
returns trigger
language plpgsql security invoker set search_path = ''
as $$
begin
  if new.currency <> 'EUR' then
    raise exception 'Only EUR listings are supported'
      using errcode = '23514';
  end if;
  if tg_op = 'INSERT' then
    -- Database-assigned chronological order, regardless of the client payload.
    new.created_at := now();
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create trigger listings_integrity_guard
  before insert or update on public.listings
  for each row execute function private.enforce_listing_integrity();

create function private.require_listing_details()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Public records require matching category details. Drafts may be composed
  -- incrementally but cannot be activated without their detail record.
  -- Deferred until transaction commit so the atomic save_student_listing RPC
  -- can write both parent and child in one transaction.
  if new.status = 'active'::public.listing_status then
    if new.kind = 'housing'::public.listing_kind
       and not exists (select 1 from public.housing_details h
                       where h.listing_id = new.id) then
      raise exception 'Active housing requires housing details'
        using errcode = '23514';
    elsif new.kind = 'marketplace'::public.listing_kind
       and not exists (select 1 from public.marketplace_details m
                       where m.listing_id = new.id) then
      raise exception 'Active marketplace listing requires item details'
        using errcode = '23514';
    end if;
  end if;
  return null;
end;
$$;

create constraint trigger listings_publish_requires_details
  after insert or update of status, kind on public.listings
  deferrable initially deferred
  for each row execute function private.require_listing_details();

-- Neither helper belongs in the exposed public RPC API.
revoke all on function private.enforce_listing_integrity() from public, anon, authenticated;
revoke all on function private.require_listing_details() from public, anon, authenticated;

commit;
