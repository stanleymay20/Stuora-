# GISMA-only access migration: staging review

Migration: `supabase/migrations/20261124100000_require_gisma_student_access.sql`
Status: **draft, not applied anywhere.** Staging only (`uptjcspizukpjcoayhtn`) after review. Production is out of scope.

## Why

On live staging (read-only check, 24 Nov 2026), a confirmed non-GISMA account with a profile passed `private.is_quota_eligible`. That account could write listings, messages, reports, profiles and group memberships. Until now the GISMA check ran only in the app (`src/account/validation.ts`) and in `private.require_community_student`.

## What it changes

| Part | Effect |
|---|---|
| `private.has_gisma_student_email` | Confirmed email matching exactly `…@gisma-student.com`, case- and space-insensitive. |
| `private.is_gisma_student_account` | The above plus a `student` profile that is not `rejected`. |
| `private.is_gisma_student` | The above plus not suspended. |
| `private.is_quota_eligible` | Now `is_gisma_student`, so AI and external-data quotas refuse outsiders. |
| `private.require_community_student` | Same rule as before, now from the shared definition. |
| `a_student_guard` triggers | BEFORE INSERT on every student-writable table, and BEFORE UPDATE where students edit. This covers RLS writes and SECURITY DEFINER RPCs. |
| Directory cleanup | Existing non-GISMA profiles get `is_discoverable = false`. **Live staging: 1 profile.** |
| `public.hook_require_gisma_signup` | A Before User Created hook function that rejects non-GISMA signups with 403. It is executable only by `supabase_auth_admin`. |

Still allowed for any signed-in account:
- deleting own content
- leaving groups and conversations
- blocking and unblocking
- archiving own listings
- hiding and editing a hidden profile
- data export
- account deletion

Writes without a JWT (service role, workers) are unaffected. Moderators do not need a GISMA address: moderation only closes, hides, deletes and decides, and all of those are allowed.

Suspension keeps its own error message. The harassment-report path for suspended students is unchanged.

## Pre-apply checks done (read-only, live staging)

- No function or trigger name collisions.
- All 22 guarded tables exist.
- 0 moderators would be affected.

## Apply (operator)

1. Review the SQL. Apply it to staging only, as migration `require_gisma_student_access`.
2. Read back:
   - the `a_student_guard` triggers (22 tables)
   - `select private.is_quota_eligible(id)` for the non-GISMA account, which should be `false`
   - that account's `is_discoverable`, which should be `false`
3. Dashboard → Authentication → Hooks → **Before User Created** → Postgres → `public.hook_require_gisma_signup`. Enable it on staging. The migration does not do this step.

## Retest

- A non-GISMA signup is refused by Auth with "Use your GISMA student email address".
- The existing non-GISMA account cannot post, message, join or report. It gets 403 `STUDENT_REQUIRED` from Events/Jobs, and can still export its data and delete its account.
- A GISMA student on Android, iOS and web can still post, message, join and report, with no new errors.

## Rollback

Disable the hook. Then, in one transaction:
- drop the `a_student_guard` triggers;
- restore the previous `private.is_quota_eligible` and `private.require_community_student` bodies (from migrations `20261023015000` and `20261123090000`);
- drop the new functions.

The directory cleanup is not reversed automatically. Students re-enable discovery themselves.

## Tests

`tests/database-gen3.test.mjs` adds two tests:
- outsiders are denied on every path, protective paths work, lookalike domains are rejected;
- hook privileges.

Both fail without the migration. Fixtures now use confirmed GISMA addresses, except where a test needs an outsider. Moderator `M` stays non-GISMA on purpose. All 15 database tests and all 143 Node tests pass.
