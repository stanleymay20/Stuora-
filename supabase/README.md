# Stuora Supabase foundation

This directory contains the database blueprint for the first production backend slice.

## Current state

- `schema.sql` defines the domain tables, explicit Data API grants, and first-pass RLS policies.
- `policy_hardening.sql` tightens listing identity updates and fixes conversation bootstrap visibility.
- `migrations/20261011020220_verified_foundation.sql` is the controlled initial migration.
- `tests/database.test.mjs` verifies role-based allow/deny behavior against Postgres.
- Both controlled migrations are applied to dedicated project `mljmifovcthvtuquvyzf`. Local filenames match hosted migration history. See `docs/AUTH_PROFILES_CHECKPOINT.md` for current live verification.

## Before applying

Create a dedicated Stuora Supabase project in the intended organization and region. Do not reuse another product's database.

Supabase changed Data API defaults in 2026, so this schema uses explicit grants rather than assuming every new public table is automatically reachable.

## Controlled application workflow

1. Connect the dedicated Stuora project.
2. Use the current Supabase CLI and discover commands via `supabase --help`.
3. Review the existing CLI-generated migration in `migrations/`. Future changes require a new migration created with `supabase migration new <descriptive-name>`.
4. Apply the controlled migration once. Do not separately apply `schema.sql` or `policy_hardening.sql`; they are review source files already incorporated in the initial migration.
5. Apply to a development environment first.
6. Verify allow/deny behavior for `anon` and `authenticated` users.
7. Run Supabase security and performance advisors.
8. Fix every material advisor finding before production.
9. Generate TypeScript database types and commit them with the app.
10. Only then wire the public client to the dedicated project URL and publishable key.

## Security decisions

- RLS is enabled on every exposed `public` table.
- `service_role`/secret keys must never ship in the Expo client.
- profile authorization fields (`account_kind`, `student_status`) are not client-writable.
- verified student benefits are read-only from the public app; clients cannot self-approve a discount or subsidy.
- benefit redemption/savings accounting is not client-writable and will be handled by a privileged server workflow.
- job applicants cannot change application review status through the public client.
- listing owner and listing kind are treated as immutable client-side identity fields after creation.

## Not yet implemented

- media Storage bucket and Storage RLS policies;
- employer/partner/admin privileged workflows;
- realtime channel authorization;
- server-side benefit redemption;
- transaction/payments integration;
- hosted Data API/Auth integration tests;
- production seed fixtures.

Those should be added only after the dedicated project exists so they can be verified against the actual platform configuration.

Run the local authorization suite with `npm run test:database`. Direct trip joins remain denied until an atomic capacity-enforcing API is implemented. Keep the `private` helper schema outside Data API exposure.
