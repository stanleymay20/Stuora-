-- Stuora internal alpha: complete publishing invariants even for direct Data API writes.
-- Forward-only; preserve earlier rate limits, category gating and RLS.
-- Deferred checks allow the legitimate save_student_listing RPC to update
-- parent price and housing rent in the same transaction.
begin;

alter table public.profiles
  add constraint profiles_city_nonblank
  check (char_length(btrim(city)) between 2 and 120);

alter table public.listings
  add constraint listings_city_nonblank
  check (char_length(btrim(city)) between 2 and 120);

alter table public.listings
  add constraint listings_published_price_required
  check (
    kind not in ('housing'::public.listing_kind, 'marketplace'::public.listing_kind)
    or status not in ('active'::public.listing_status, 'reserved'::public.listing_status)
    or price_cents is not null
  );

-- Retain the already-reviewed restrictions on unpublished categories,
-- currency, server-owned chronology and student action rate limit.
create or replace function private.enforce_listing_integrity()
returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if new.currency is distinct from 'EUR' then
    raise exception 'Only EUR listings are supported' using errcode = '23514';
  end if;
  if (select auth.uid()) is not null
     and new.kind not in ('housing'::public.listing_kind,'marketplace'::public.listing_kind) then
    raise exception 'This category is not yet accepting student submissions' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
  elsif tg_op = 'UPDATE' then
    -- Students cannot unarchive a closed listing by updating status directly.
    if (select auth.uid()) is not null
       and old.status = 'closed'::public.listing_status
       and new.status <> 'closed'::public.listing_status then
      raise exception 'Archived listing cannot be reopened'
        using errcode = '42501';
    end if;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

-- Read the FINAL parent/child state at commit, not NEW from an earlier queued
-- event. The parent may have been archived or removed later in the transaction.
create function private.assert_published_listing(p_listing_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  v_kind public.listing_kind;
  v_status public.listing_status;
  v_price integer;
  v_rent integer;
begin
  select l.kind, l.status, l.price_cents
  into v_kind, v_status, v_price
  from public.listings as l where l.id = p_listing_id;
  if not found or v_status not in
      ('active'::public.listing_status, 'reserved'::public.listing_status) then
    return;
  end if;
  if v_kind = 'housing'::public.listing_kind then
    if v_price is null then
      raise exception 'Published housing must specify a price'
        using errcode = '23514';
    end if;
    select h.rent_cents into v_rent
    from public.housing_details as h where h.listing_id = p_listing_id;
    if not found then
      raise exception 'Published housing requires housing details'
        using errcode = '23514';
    end if;
    if v_rent is distinct from v_price then
      raise exception 'Published housing rent must match listing price'
        using errcode = '23514';
    end if;
  elsif v_kind = 'marketplace'::public.listing_kind then
    if v_price is null then
      raise exception 'Published marketplace listing must specify a price'
        using errcode = '23514';
    end if;
    if not exists (select 1 from public.marketplace_details m
                   where m.listing_id = p_listing_id) then
      raise exception 'Published marketplace listing requires item details'
        using errcode = '23514';
    end if;
  end if;
end;
$$;

create or replace function private.require_listing_details()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_table_name = 'listings' then
    perform private.assert_published_listing(new.id);
  else
    -- Updating detail ownership cannot orphan either the old or new parent.
    if tg_op in ('DELETE', 'UPDATE') then
      perform private.assert_published_listing(old.listing_id);
    end if;
    if tg_op in ('INSERT', 'UPDATE') then
      perform private.assert_published_listing(new.listing_id);
    end if;
  end if;
  return null;
end;
$$;

drop trigger if exists listings_publish_requires_details on public.listings;
create constraint trigger listings_publish_requires_details
  after insert or update of status, kind, price_cents on public.listings
  deferrable initially deferred
  for each row execute function private.require_listing_details();

create constraint trigger housing_details_preserve_published_integrity
  after insert or update or delete on public.housing_details
  deferrable initially deferred
  for each row execute function private.require_listing_details();

create constraint trigger marketplace_details_preserve_published_integrity
  after insert or update or delete on public.marketplace_details
  deferrable initially deferred
  for each row execute function private.require_listing_details();

revoke all on function private.assert_published_listing(uuid)
  from public, anon, authenticated;
revoke all on function private.require_listing_details()
  from public, anon, authenticated;
revoke all on function private.enforce_listing_integrity()
  from public, anon, authenticated;

commit;
