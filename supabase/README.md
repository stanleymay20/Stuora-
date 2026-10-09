# Stuora Supabase foundation

This directory contains the database blueprint for the first production backend slice.

## Current state

- `schema.sql` defines the domain tables, explicit Data API grants, and first-pass RLS policies.
- `policy_hardening.sql` tightens listing identity updates and fixes conversation bootstrap visibility.
- Neither file has been applied to an unrelated Supabase project.

## Before applying

Create a dedicated Stuora Supabase project in the intended organization and region. Do not reuse another product's database.

Supabase changed Data API defaults in 2026, so this schema uses explicit grants rather than assuming every new public table is automatically reachable.

## Controlled application workflow

1. Connect the dedicated Stuora project.
2. Use the current Supabase CLI and discover commands via `supabase --help`.
3. Create the actual migration with `supabase migration new <descriptive-name>` rather than inventing a migration filename.
4. Apply `schema.sql` and `policy_hardening.sql` into that generated migration, reviewing the combined SQL before execution.
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
- database policy test suite;
- production seed fixtures.

Those should be added only after the dedicated project exists so they can be verified against the actual platform configuration.
