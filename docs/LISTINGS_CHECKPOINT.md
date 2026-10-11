# Housing and Marketplace checkpoint

Built from verified main `496c4bece1a5fafd8882aa8a96ef345a724c036e`.
Dedicated Stuora project: `mljmifovcthvtuquvyzf`, Frankfurt. No unrelated project
was read or mutated. Existing app, navigation and CI gates remain in place.

## Implemented

Housing and Marketplace now use persisted Supabase records instead of seeded
or session-only offers. Public discovery reads active rows; signed-in owners
can switch to My listings, edit active posts or archive them with confirmation.
Archived rows remain visible to their owner and disappear from public discovery.
Cards open real details. Text listings clearly disclose that photos and messaging
are not available. Trips, Jobs, Events, People and Savings remain demo experiences.
The Savings preview is labeled in its launcher and positioned above mobile tabs.

Creation requires login and a saved profile. Titles, descriptions, cities and
EUR prices have client validation and database constraints. Housing includes
monthly rent, type, furnishing and bills; Marketplace includes condition, one
item and pickup-only collection. Student participation has no Stuora fee.

`save_student_listing` runs with SECURITY INVOKER and an empty search path.
It derives owner identity from auth.uid(), retains existing RLS and grants,
and saves the parent plus category details in one transaction. Failed detail
writes roll back parent creation/updates. Existing owner/kind immutability is
retained. Edits lock the parent and reject unavailable, archived or foreign posts.
Only authenticated callers have EXECUTE. No privileged keys are used.

The app fetches 24 listings per page with deterministic ordering, load-more,
title search, refresh/retry, loading and empty states. Fetch cancellation prevents
old category/account responses from populating the current screen. Account
changes remount listing state. Save errors preserve input for retry. Reads refresh
on screen entry or the explicit Refresh button; realtime is not implemented.

## Verification

- Migration `20261011022529_persist_student_listings.sql` applied once to the
  dedicated project; local filename matches hosted migration history.
- 136 authorization/transaction assertions against real WASM Postgres, with and
  without inherited grants. Includes anonymous access, cross-user tampering,
  parent/detail rollback, unchanged kind, free pricing, archived visibility and
  all existing trust/messaging/application/savings protections.
- `tests/hosted/listings.sql` passed against hosted Postgres with real anon and
  authenticated roles. Exercises both categories, update, rollback, cross-user
  edit/archive denial and public visibility. Everything rolls back; no fixtures
  or offers remain. These tests simulate JWT claims at the SQL boundary.
- 18 desktop/mobile-web browser tests pass: the prior eight account tests plus
  Housing/Marketplace publishing, separate anonymous-client discovery, reload,
  edit, archive, owner-only controls, validation, read/save failures and retries, title search, pagination and preserved session-only trip publishing.
  These use mocked HTTP contracts; they are not live two-account Auth/API tests.
- Visual review of desktop/mobile details; regression assertion checks that the
  Savings launcher does not cover the mobile Create tab.
- Expo dependency check, TypeScript, web export and native bundle exports pass.
- Live HTTP: nested public listing reads return 200; anonymous save RPC returns
  401/42501.
- Hosted security advisor has no findings. Performance notices are INFO unused
  indexes on the small database; retain policy/FK indexes pending real traffic.
  See https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index.

## Release limits and next work

No public web deployment, app-store release, successful live signup/SMTP delivery,
native-device runtime or full Account A/B Data API demo is claimed. Those remain
release qualifications from the Auth checkpoint. Configure the actual deployed
web origin and verify confirmation email delivery before a professor demonstration.

There are no uploads or real messages yet, so students cannot contact a listing
owner in this slice. Next implement persistent Trips/Jobs/Events using their own
validated contracts, then Storage and secure messaging. No payment UI or fake
verification has been added. Hard deletion and archived-post reopening are not
in the UI; archiving is the supported removal action.
