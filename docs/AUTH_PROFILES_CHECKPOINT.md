# Stuora Auth + profiles checkpoint

## Live identity

- Recovered main: `cf4d4df6e6a6dd8dff5fc0947da70079ce4c2f39` (PR #5).
- Dedicated account connection: Stuora.
- Organization: `olnrnjxahvkhjkmjhavf`, separate from the unrelated existing projects.
- Adopted dedicated project: `mljmifovcthvtuquvyzf`, eu-central-1, ACTIVE_HEALTHY.
- Dashboard project name remains generic; no rename tool was used.
- Initial migration and policy refinement are applied. Local migration version prefixes have been synchronized to the hosted history to avoid accidental replay.
- No changes were made to WhatsApp or ScrollMarketer projects.

## Implemented slice

The You tab now uses Supabase Auth and the live profiles table, replacing its
previous placeholder Passport, fake stats and dead menu. It supports sign-up,
confirmation-required state, password login, persistent sessions, local logout,
profile creation/editing, discovery privacy, validation, loading, error/retry
states and server-issued trust status display. All platforms use one backend.

Session callbacks are synchronous, with profile loading in a separate effect.
Stale responses cannot populate another account's profile. Profile mutation
payloads include only editable fields and the authenticated user's ID. Public
email is excluded from profile records. Student verification is not self-issued.

The client uses only a publishable key. Configuration refuses a mismatched
project or secret/service key. `.env.example` includes only public identifiers.
Listing creation remains local demo. Messages and Savings remain demo. These
are visibly labelled and have not been presented as production functions.

## Verification

- 96 Postgres role-isolation assertions pass against all controlled migrations,
  with and without inherited table-wide privileges.
- Hosted SQL fixture tests pass for own profile create/update/read, hidden
  profile denial, cross-user update denial, impersonation denial and trust-field
  denial. All fixtures were rolled back; no test users remain from that test.
- Live Data API: anonymous listing SELECT succeeds with an empty result;
  anonymous profile SELECT is denied (401/42501).
- Live Auth: invalid credentials are rejected (400/invalid_credentials).
- Security advisor: no findings.
- Performance advisor: only INFO unused indexes on the new database. Keep
  indexes for policy/FK lookups until representative traffic exists; see
  https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index.
- Eight browser account tests cover desktop and mobile web: profile create/edit,
  privacy, reload persistence, logout, signup pending confirmation, input/auth
  errors and profile-fetch retry without accidental creation. These use mocked
  network contracts, not live test-account credentials or SMTP.
- Expo dependency check, strict TypeScript, production web export and both iOS
  and Android Hermes bundle exports pass locally. CI adds browser and native
  exports alongside every existing gate.

## Release qualifications still required

No successful real signup/confirmation delivery or native-device login is
claimed. Configure Auth Site URL and allowed redirect origins to the deployed
Stuora web URL, verify email templates/SMTP and run real Account A/B onboarding.
Web signup requests its origin as emailRedirectTo; that origin must be allowed.
Native users confirm their email and return to sign in; deep-link login is not
implemented. Never disable email confirmation merely to make a demo pass.

No public web deployment or app-store build was published in this slice. A
bundle export proves compilation, not native runtime behavior. Native device
session persistence and foreground/background refresh still require tests.

Housing/Marketplace persistence has now been implemented; see
`LISTINGS_CHECKPOINT.md` for its evidence and remaining release qualifications. Media, messaging,
atomic trip joins, safety/blocks and real Savings remain later dependencies.
