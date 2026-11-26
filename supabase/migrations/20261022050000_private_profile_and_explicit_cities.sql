-- P0 privacy-by-default and real location integrity.
-- Existing profile discoverability, existing city values, and existing listings
-- are deliberately NOT rewritten. Applies to new rows without explicit values.
begin;

-- New profiles must opt IN to appearing in the student directory.
alter table public.profiles
  alter column is_discoverable set default false;

-- A missing city must not silently create fictional Berlin residents/listings.
-- Existing NOT NULL / 2..120-character checks remain active.
alter table public.profiles
  alter column city drop default;
alter table public.listings
  alter column city drop default;

commit;
