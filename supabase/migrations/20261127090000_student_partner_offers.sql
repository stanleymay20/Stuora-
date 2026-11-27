-- Partner-approved reusable offers only. Never store private or single-use codes here.
alter table public.student_benefits
  add column offer_kind text check (offer_kind in ('subscription', 'coupon')),
  add column redemption_url text check (redemption_url ~ '^https://[^[:space:]]+$'),
  add column redemption_instructions text,
  add column subscription_terms text,
  add constraint student_offer_details check (
    (offer_kind is null and redemption_url is null and redemption_instructions is null and subscription_terms is null)
    or (offer_kind is not null and
      nullif(trim(redemption_instructions), '') is not null
      and (offer_kind <> 'subscription' or (
        student_price_cents is not distinct from 0
        and nullif(trim(subscription_terms), '') is not null
      ))
    )
  );
comment on column public.student_benefits.subscription_terms is
  'Partner-confirmed free period, card requirement, renewal price and cancellation terms.';

-- Keep legacy public benefits accessible. New partner offers require student access.
create policy partner_offers_signed_in on public.student_benefits as restrictive
  for select to anon using (offer_kind is null);
create policy partner_offers_student_access on public.student_benefits as restrictive
  for select to authenticated using (offer_kind is null or (select private.current_user_is_gisma_student()));
