# Stuora backend checkpoint — 2026-10-10 UTC

Historical recovery checkpoint. Superseded by `AUTH_PROFILES_CHECKPOINT.md`: the connected Stuora project has since been adopted and both migrations applied.

## Recovered state

- Verified remote main: `1dff9e58e5423c8be07f3baa61131d0b6addc387`.
- No open PRs at recovery; main CI run 37931239791 passed.
- Existing Expo UI, local creation/search, Savings, and navigation preserved.
- No hosted application URL or deployment configuration found in the repository; hosted runtime not verified.
- The app has no Supabase client or live backend integration yet.

## Dedicated backend blocker

The connected account named **Stuora** exposes organization
`olnrnjxahvkhjkmjhavf` (display name Stanley Osei-Wusu), separate from the
previous `zslzvklowljnhnpznqos` organization. It contains one healthy Frankfurt
project `mljmifovcthvtuquvyzf`, named `stanleymay20@yahoo.com's Project`, created
2026-10-10. Its public schema is empty. Its product purpose has not been
confirmed, so it has not been mutated or adopted for Stuora.

Creating a separate project through the connector is blocked: `get_cost`
returns `MCP tool get_cost was not returned by tools/list`. No price or cost
confirmation can therefore be obtained. The cloud dashboard is signed out.
No project was created and no SQL was applied remotely. The WhatsApp and
ScrollMarketer databases have not been touched.

To unblock, create a project named **Stuora** in the new organization, choose
Frankfurt (`eu-central-1`), and connect that project to the Stuora connector.
Alternatively, explicitly confirm that the generic project above is dedicated
to Stuora before applying any migrations there. Never use a service-role key
in the Expo app.

## Completed repository slice

The CLI-generated initial migration in `supabase/migrations` carries the
reviewed existing schema and hardening in one transaction. It fixes:

- message membership subqueries accidentally comparing a column to itself;
- application INSERT accepting caller-selected review status;
- inherited table-wide grants overriding column restrictions;
- detail rows attached to the wrong listing category;
- mutable message history and caller-selected message timestamps;
- RLS recursion during conversation membership INSERT with RETURNING;
- missing indexes on foreign-key/policy lookup columns.

The private SECURITY DEFINER ownership helper is narrowly scoped: it checks
only whether auth.uid() owns the supplied conversation, rejects unauthenticated
callers, fixes search_path, grants execution only to authenticated, and lives
outside public. Keep `private` out of exposed Data API schemas.

Direct trip joins are intentionally denied pending an atomic, capacity-enforcing
join API. Read/leave access remains. This is a backend release restriction;
no previously live or functional trip join was removed from the app.

## Verification and limits

`npm run test:database` executes the controlled migration in PGlite (real
Postgres compiled to WASM), with Supabase auth.uid() modeled from the request
claim. The suite exercises three users plus anon, both with and without
inherited full table grants. It checks ownership, drafts, private profiles,
trust fields, applications, conversation bootstrap, cross-conversation access,
spoofed senders, offers, forged savings, reports and RLS coverage.

CI now uses the committed lockfile with `npm ci` and runs the database suite
alongside every existing Expo, TypeScript and production web export gate.

These tests do not replace hosted Supabase advisors, Data API tests, real Auth,
Storage, Realtime, native-device tests or concurrency tests. None of those is
claimed complete. Before the app is wired, apply the migration to the confirmed
dedicated project, run both advisors, generate types and verify real allow/deny
queries. Then implement Auth + profiles as the next small vertical slice.

## Remaining product gaps

Blocks and moderation enforcement, atomic trip joins, savings reads/redemptions,
notifications, media, consent rules for inviting conversation participants and
server-managed verification remain future controlled slices. Profiles currently
contain public-facing fields only; private documents must use a separate private
store. This schema is not a commercial readiness claim.
