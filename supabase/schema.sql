begin;

create type public.account_kind as enum ('student', 'employer', 'partner');
create type public.student_verification_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type public.listing_kind as enum ('housing', 'marketplace', 'trip', 'job', 'event');
create type public.listing_status as enum ('draft', 'active', 'reserved', 'closed');
create type public.marketplace_condition as enum ('new', 'like_new', 'good', 'fair');
create type public.workplace_mode as enum ('onsite', 'hybrid', 'remote');
create type public.application_status as enum ('submitted', 'reviewing', 'accepted', 'rejected');
create type public.benefit_type as enum ('discount', 'subsidy', 'freebie', 'cashback');
create type public.report_reason as enum ('spam', 'fraud', 'harassment', 'unsafe', 'prohibited', 'other');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  city text not null default 'Berlin' check (char_length(city) between 2 and 120),
  bio text not null default '' check (char_length(bio) <= 600),
  avatar_path text,
  is_discoverable boolean not null default true,
  account_kind public.account_kind not null default 'student',
  student_status public.student_verification_status not null default 'unverified',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  kind public.listing_kind not null,
  status public.listing_status not null default 'draft',
  title text not null check (char_length(title) between 3 and 140),
  description text not null default '' check (char_length(description) <= 4000),
  city text not null default 'Berlin' check (char_length(city) between 2 and 120),
  price_cents integer check (price_cents is null or price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index listings_kind_status_created_idx on public.listings (kind, status, created_at desc);
create index listings_owner_idx on public.listings (owner_id, created_at desc);
create index listings_city_idx on public.listings (city);

create table public.housing_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  housing_type text not null check (housing_type in ('room', 'wg', 'studio', 'apartment', 'sublet', 'temporary')),
  rent_cents integer not null check (rent_cents >= 0),
  deposit_cents integer check (deposit_cents is null or deposit_cents >= 0),
  available_from date,
  available_until date,
  furnished boolean not null default false,
  bills_included boolean not null default false,
  room_size_sqm numeric(6,2) check (room_size_sqm is null or room_size_sqm > 0),
  check (available_until is null or available_from is null or available_until >= available_from)
);

create table public.marketplace_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  item_condition public.marketplace_condition not null default 'good',
  quantity integer not null default 1 check (quantity > 0),
  pickup_only boolean not null default true
);

create table public.trip_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  destination text not null check (char_length(destination) between 2 and 160),
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer not null check (capacity between 2 and 100),
  estimated_cost_cents integer check (estimated_cost_cents is null or estimated_cost_cents >= 0),
  check (ends_at is null or ends_at >= starts_at)
);

create table public.job_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  company_name text not null check (char_length(company_name) between 2 and 160),
  compensation_text text not null default '' check (char_length(compensation_text) <= 160),
  hours_per_week_min numeric(4,1) check (hours_per_week_min is null or hours_per_week_min >= 0),
  hours_per_week_max numeric(4,1) check (hours_per_week_max is null or hours_per_week_max >= 0),
  workplace_mode public.workplace_mode,
  application_url text,
  check (hours_per_week_max is null or hours_per_week_min is null or hours_per_week_max >= hours_per_week_min)
);

create table public.event_details (
  listing_id uuid primary key references public.listings(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  capacity integer check (capacity is null or capacity > 0),
  venue_name text,
  check (ends_at is null or ends_at >= starts_at)
);

create table public.saved_listings (
  user_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.trip_participants (
  trip_listing_id uuid not null references public.listings(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (trip_listing_id, user_id)
);

create table public.job_applications (
  id uuid primary key default gen_random_uuid(),
  job_listing_id uuid not null references public.listings(id) on delete cascade,
  applicant_id uuid not null references public.profiles(id) on delete cascade,
  cover_note text not null default '' check (char_length(cover_note) <= 2000),
  status public.application_status not null default 'submitted',
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_listing_id, applicant_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default '' check (char_length(title) <= 160),
  created_at timestamptz not null default now()
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc);

create table public.student_benefits (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid references public.listings(id) on delete cascade,
  title text not null check (char_length(title) between 3 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  benefit_type public.benefit_type not null,
  sponsor_name text not null check (char_length(sponsor_name) between 2 and 160),
  sponsor_url text,
  original_price_cents integer check (original_price_cents is null or original_price_cents >= 0),
  student_price_cents integer check (student_price_cents is null or student_price_cents >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  starts_at timestamptz,
  ends_at timestamptz,
  eligibility_text text not null default 'Verified student' check (char_length(eligibility_text) <= 500),
  terms_url text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at >= starts_at),
  check (original_price_cents is null or student_price_cents is null or student_price_cents <= original_price_cents)
);

create table public.benefit_redemptions (
  id uuid primary key default gen_random_uuid(),
  benefit_id uuid not null references public.student_benefits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  savings_cents integer not null check (savings_cents >= 0),
  redeemed_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete set null,
  reported_user_id uuid references public.profiles(id) on delete set null,
  reason public.report_reason not null,
  details text not null default '' check (char_length(details) <= 2000),
  created_at timestamptz not null default now(),
  check (listing_id is not null or reported_user_id is not null)
);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger listings_set_updated_at
before update on public.listings
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.listings enable row level security;
alter table public.housing_details enable row level security;
alter table public.marketplace_details enable row level security;
alter table public.trip_details enable row level security;
alter table public.job_details enable row level security;
alter table public.event_details enable row level security;
alter table public.saved_listings enable row level security;
alter table public.trip_participants enable row level security;
alter table public.job_applications enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.student_benefits enable row level security;
alter table public.benefit_redemptions enable row level security;
alter table public.reports enable row level security;

-- Explicit grants are required because new Supabase projects may not auto-expose public tables.
grant select on public.listings, public.housing_details, public.marketplace_details, public.trip_details, public.job_details, public.event_details, public.student_benefits to anon, authenticated;
grant select on public.profiles, public.saved_listings, public.trip_participants, public.job_applications, public.conversations, public.conversation_members, public.messages, public.reports to authenticated;
grant insert, update, delete on public.listings, public.housing_details, public.marketplace_details, public.trip_details, public.job_details, public.event_details, public.saved_listings, public.trip_participants, public.conversations, public.conversation_members, public.messages, public.reports to authenticated;
grant insert, delete on public.job_applications to authenticated;
grant update (withdrawn_at) on public.job_applications to authenticated;
grant insert (id, display_name, city, bio, avatar_path, is_discoverable) on public.profiles to authenticated;
grant update (display_name, city, bio, avatar_path, is_discoverable) on public.profiles to authenticated;

-- Student benefits and redemption records are read-only to app clients.
-- Creation/verification/redemption accounting must happen through privileged server/admin workflows.

grant select on public.student_benefits to anon, authenticated;

create policy "profiles_read_discoverable_or_self"
on public.profiles for select
to authenticated
using (is_discoverable or id = (select auth.uid()));

create policy "profiles_insert_self"
on public.profiles for insert
to authenticated
with check (id = (select auth.uid()));

create policy "profiles_update_self"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "listings_read_active_or_owned"
on public.listings for select
to anon, authenticated
using (status = 'active' or owner_id = (select auth.uid()));

create policy "listings_insert_owned"
on public.listings for insert
to authenticated
with check (owner_id = (select auth.uid()));

create policy "listings_update_owned"
on public.listings for update
to authenticated
using (owner_id = (select auth.uid()))
with check (owner_id = (select auth.uid()));

create policy "listings_delete_owned"
on public.listings for delete
to authenticated
using (owner_id = (select auth.uid()));

create policy "housing_read_when_parent_visible"
on public.housing_details for select
to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "housing_write_when_parent_owned"
on public.housing_details for all
to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

create policy "marketplace_read_when_parent_visible"
on public.marketplace_details for select
to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "marketplace_write_when_parent_owned"
on public.marketplace_details for all
to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

create policy "trip_read_when_parent_visible"
on public.trip_details for select
to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "trip_write_when_parent_owned"
on public.trip_details for all
to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

create policy "job_read_when_parent_visible"
on public.job_details for select
to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "job_write_when_parent_owned"
on public.job_details for all
to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

create policy "event_read_when_parent_visible"
on public.event_details for select
to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));

create policy "event_write_when_parent_owned"
on public.event_details for all
to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.owner_id = (select auth.uid())));

create policy "saved_listings_self"
on public.saved_listings for all
to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "trip_participants_read_visible_trip"
on public.trip_participants for select
to authenticated
using (exists (select 1 from public.listings l where l.id = trip_listing_id and l.kind = 'trip'));

create policy "trip_participants_join_self"
on public.trip_participants for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.listings l where l.id = trip_listing_id and l.kind = 'trip' and l.status = 'active')
);

create policy "trip_participants_leave_self"
on public.trip_participants for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "job_applications_read_applicant_or_owner"
on public.job_applications for select
to authenticated
using (
  applicant_id = (select auth.uid())
  or exists (
    select 1 from public.listings l
    where l.id = job_listing_id and l.owner_id = (select auth.uid()) and l.kind = 'job'
  )
);

create policy "job_applications_submit_self"
on public.job_applications for insert
to authenticated
with check (
  applicant_id = (select auth.uid())
  and exists (
    select 1 from public.listings l
    where l.id = job_listing_id and l.kind = 'job' and l.status = 'active'
  )
);

create policy "job_applications_withdraw_self"
on public.job_applications for update
to authenticated
using (applicant_id = (select auth.uid()))
with check (applicant_id = (select auth.uid()));

create policy "job_applications_delete_self"
on public.job_applications for delete
to authenticated
using (applicant_id = (select auth.uid()));

create policy "conversations_read_member"
on public.conversations for select
to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = id and cm.user_id = (select auth.uid())
  )
);

create policy "conversations_create_self"
on public.conversations for insert
to authenticated
with check (creator_id = (select auth.uid()));

create policy "conversation_members_read_self"
on public.conversation_members for select
to authenticated
using (user_id = (select auth.uid()));

create policy "conversation_members_creator_adds"
on public.conversation_members for insert
to authenticated
with check (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id and c.creator_id = (select auth.uid())
  )
);

create policy "conversation_members_leave_self"
on public.conversation_members for delete
to authenticated
using (user_id = (select auth.uid()));

create policy "messages_read_member"
on public.messages for select
to authenticated
using (
  exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_id and cm.user_id = (select auth.uid())
  )
);

create policy "messages_send_as_self_member"
on public.messages for insert
to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = conversation_id and cm.user_id = (select auth.uid())
  )
);

create policy "benefits_read_verified_active"
on public.student_benefits for select
to anon, authenticated
using (
  verified_at is not null
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

create policy "reports_insert_self"
on public.reports for insert
to authenticated
with check (reporter_id = (select auth.uid()));

create policy "reports_read_self"
on public.reports for select
to authenticated
using (reporter_id = (select auth.uid()));

commit;
