begin;
-- One transaction for parent + category details. Runs under the caller's RLS.
create function public.save_student_listing(
  p_id uuid, p_kind public.listing_kind, p_title text, p_description text,
  p_city text, p_price_cents integer, p_housing_type text,
  p_furnished boolean, p_bills_included boolean,
  p_condition public.marketplace_condition
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare result_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_kind is null or p_kind not in ('housing', 'marketplace') then
    raise exception 'Unsupported listing category' using errcode = '22023';
  end if;
  if p_price_cents is null or p_price_cents < 0 then
    raise exception 'A nonnegative EUR price is required' using errcode = '22023';
  end if;
  if p_id is null then
    insert into public.listings(owner_id, kind, status, title, description, city, price_cents)
    values(auth.uid(), p_kind, 'active', btrim(p_title), btrim(p_description), btrim(p_city), p_price_cents)
    returning id into result_id;
    if p_kind = 'housing' then
      insert into public.housing_details(listing_id, housing_type, rent_cents, furnished, bills_included)
      values(result_id, p_housing_type, p_price_cents, p_furnished, p_bills_included);
    else
      insert into public.marketplace_details(listing_id, item_condition)
      values(result_id, p_condition);
    end if;
  else
    -- Lock parent first, serializing concurrent edits/archives and preserving kind.
    select id into result_id from public.listings
      where id = p_id and owner_id = auth.uid() and kind = p_kind and status = 'active'
      for update;
    if result_id is null then raise exception 'Listing unavailable or not yours' using errcode = '42501'; end if;
    update public.listings set title = btrim(p_title), description = btrim(p_description),
      city = btrim(p_city), price_cents = p_price_cents where id = result_id;
    if p_kind = 'housing' then
      update public.housing_details set housing_type = p_housing_type, rent_cents = p_price_cents,
        furnished = p_furnished, bills_included = p_bills_included where listing_id = result_id;
    else
      update public.marketplace_details set item_condition = p_condition where listing_id = result_id;
    end if;
    if not found then raise exception 'Listing details missing' using errcode = '22023'; end if;
  end if;
  return result_id;
end;
$$;
revoke all on function public.save_student_listing(uuid, public.listing_kind, text, text, text, integer, text, boolean, boolean, public.marketplace_condition) from public, anon;
grant execute on function public.save_student_listing(uuid, public.listing_kind, text, text, text, integer, text, boolean, boolean, public.marketplace_condition) to authenticated;
commit;
