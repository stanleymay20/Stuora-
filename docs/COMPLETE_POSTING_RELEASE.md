# Complete Stuora posting — controlled release candidate

Base main: bfdd2bfc8fac4b975f9a8336fa89cedbff6e1840. New code extends the existing listing workspace; no replacement app or parallel listing store is introduced.

## User behavior

- Housing / Marketplace: existing create, discover, edit, archive and photos stay intact.
- Posts: signed-in users with completed profiles publish community content, discover/reload it, edit/archive their own records and contact an author.
- Trips: publish destination, future dates, participant capacity and estimated cost; join/leave persisted participation.
- Events: publish venue, future dates, capacity and price; attend/leave persisted participation.
- Jobs: approved employer/partner profiles publish; students apply/withdraw; the owning publisher reviews applications. Students may submit a durable publisher-access request but cannot approve it or change protected profile roles.
- Safety: report listings with reasons/details; block/unblock an author; bilateral blocks prevent new contact and sending in existing conversations, applications and joins.

No payment, escrow, travel booking, automatic verification, money wallet, ticket issuance, general comments/likes or automatic moderation is claimed. Reports are persisted for human review; they do not automatically remove content. Services and Savings commercial publishing are outside this request to enable Posts/Trips/Jobs/Events.

## Backend boundaries

`save_community_listing` is a public SECURITY INVOKER wrapper around a private, tightly scoped implementation. The implementation validates Auth UID, completed profile, supported kind, publisher role for Jobs, ownership on edits, active state, text/date/capacity constraints and atomic parent/details writes. Failed validation rolls back the parent and quota consumption.

Participation locks the parent listing before counting and writing. Capacity edits use the same parent lock, and direct category-detail/participant mutation grants are revoked, including inherited column UPDATE grants. Repeated joins/applications are idempotent. A user cannot participate in their own listing. Archived participation can be left/withdrawn, while unrelated users cannot inspect its state. Job status review requires the approved publisher who owns that job; withdrawn applications cannot be reviewed or resubmitted.

Server counters use atomic INSERT ... ON CONFLICT updates and server time: 20 new listings/hour, 60 messages/minute, 10 new conversations/hour, 20 applications/hour, 30 joins/hour and 10 reports/hour. Limits apply to direct message/listing/application/report inserts, not just UI actions. Existing conversation reopening does not spend another conversation quota. Counters live in an inaccessible private RLS table.

New public event participation, user blocks and publisher requests have RLS, explicit grants, ownership predicates and indexes. Clients cannot mutate approval fields or protected profile roles. Public Storage ownership/path predicates remain enforced; the candidate extends category eligibility to the new listings, with approved publisher checks for Jobs. Existing public-bucket privacy/archived-media concerns remain a GA qualification item.

## Applied versus pending

The additive `post` enum was applied successfully and is recorded as `20261012181606_community_post_kind`. The generated live database types were refreshed for that state. The broader migration `20261012182717_complete_category_posting_release.sql` has NOT been applied.

Automatic approval review rejected direct production application of the broader migration because it changes privileges, RLS, triggers, messaging, rate limits, Storage and multiple workflows beyond posting-only approval. No workaround or indirect execution was used. Code/tests were completed as a reviewable release candidate instead. Production needs explicit approval of this broader scope.

The reviewed pending API contract is isolated in `src/backend/posting.contract.ts`; it is not falsely labelled as generated from the live schema. After applying the approved migration, regenerate live types, preserve nullable create-ID arguments, remove the temporary contract overlay when equivalent, run advisors and hosted acceptance, and re-run full exact-head CI before merge.

## Release flag and verification

`EXPO_PUBLIC_STUORA_COMPLETE_POSTING` defaults to false. CI uses true only with the reserved mock backend, and exercises the complete candidate. Existing production builds keep new categories/safety calls closed until the migration and hosted qualification succeed. Turning the flag on alone does not make the app GA-ready.

Local verification: 54 desktop/mobile browser contract tests passed; 238 authorization assertions pass in each of two Postgres setups (with and without inherited grants); strict TypeScript and web export pass. The browser contracts exercise two separate contexts but use intercepted APIs; they are not hosted two-account or physical-device acceptance. Full exact-head GitHub CI and native exports are required before release.

## Production sequence after approval

1. Verify candidate SHA and unchanged green main.
2. Apply only the reviewed pending migration; read back definitions/grants/RLS and run security/performance advisors.
3. Align the local migration version with hosted history and regenerate types; commit any resulting changes, then run full exact-head CI again.
4. Verify real ownership, denied escalation, persisted posting, capacity-safe participation, applications, report/block behavior and legacy flows on an isolated hosted environment.
5. Merge only the exact green head, verify main again, then deploy a qualified build with explicit environment settings and the release flag enabled.
6. Do not promote to GA until the remaining SMTP/Auth redirects, observability, recovery, legal and physical-device gates are evidenced.

Vercel `stuora-preview` access was blocked by team-scope authorization at the prior checkpoint. No deployment is claimed by this PR. Human publisher review and moderation operating procedures remain mandatory before public launch.
