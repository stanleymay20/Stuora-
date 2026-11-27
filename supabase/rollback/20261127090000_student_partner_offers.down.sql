-- Rollback for 20261127090000_student_partner_offers.sql (staging only).
-- Applied on staging 27 Nov 2026 as version 20261127180110. Removes partner-offer
-- fields and their access policies; legacy benefits are untouched. Any partner
-- offers stored in these columns are deleted with them, so export them first.
begin;
drop policy if exists partner_offers_student_access on public.student_benefits;
drop policy if exists partner_offers_signed_in on public.student_benefits;
delete from public.student_benefits where offer_kind is not null;
alter table public.student_benefits
  drop constraint if exists student_offer_details,
  drop column if exists subscription_terms,
  drop column if exists redemption_instructions,
  drop column if exists redemption_url,
  drop column if exists offer_kind;
commit;
