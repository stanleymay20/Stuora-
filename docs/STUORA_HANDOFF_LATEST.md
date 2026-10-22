# STUORA — CANONICAL CONTINUATION & RELEASE-SECURITY HANDOFF

**Checked 2026-10-22, Europe/Berlin.** The live refs, status and commit references below are a timestamped checkpoint. **Always read actual HEAD, CI, migrations, deployment and policy state before editing or making readiness claims.** This document SUPERSEDES earlier next-chat prompts and outdated progress sections in `docs/STUORA_CONTROLLED_HANDOFF_2026-10-22.md`.

## Objective and project identity
Build **Stuora** into a trusted, beautiful, scalable, high-standard, student-first life platform, beyond an academic demonstration but **without claiming beta/GA** until evidence proves it. Genuine data only; no fake students, offers, listings, testimonials, ratings or partnerships. Students can discover Housing, Marketplace, Groups and later Jobs, Trips, Events, opportunities and carefully verified Savings. Multi-role future: universities, landlords, employers, local businesses and alumni. Student core stays free; possible B2B monetization remains speculative. Product polish matters: attractive, compact full-body blinking floating Stuora Bot, responsive accessible UX, no hardcoded Berlin/cities, useful real-world functionality, honest zero-data states and a separate landing page when authorized.

**Repository:** https://github.com/stanleymay20/Stuora- (Expo / React Native Web / TypeScript / Supabase).
**Active implementation:** `feat/stuora-ai-business-foundation-20261018`, [draft PR #23](https://github.com/stanleymay20/Stuora-/pull/23) to main. Leave unmerged. Related reference PRs #21 (UI) and #22 (Groups) remain separate; do not create parallel apps.
**Exact code HEAD at this verification:** `c847760f24f49bd2a04c1175381f9542e9ec8dd5`.
**GitHub CI:** [run #39739883627](https://github.com/stanleymay20/Stuora-/actions/runs/39739883627), verified **SUCCESS** at that exact SHA across `verify`, `rls-authorization`, and `trusted-media-edge`. Expo dependency mismatch from older October checkpoint has been fixed; DO NOT waste work reverting to that stale diagnosis. Any documentation commit after this checkpoint advances the SHA and triggers a new CI run; recheck it.

## Separation of systems — DO NOT MIX
- **Supabase staging:** `uptjcspizukpjcoayhtn`, active/healthy, dedicated Stuora connector `link_6acabc01f5b481919b8c38570df3b911`.
- **Supabase production:** separate `mljmifovcthvtuquvyzf`; no production changes authorized here. Previously reported inactive; reverify status if relevant.
- **Vercel existing project:** `stuora-preview`, id `prj_P56IpJmpGcA86f3EIBiJtQ2bLUSE`.
- **Approved preview origin:** https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app
- At checkpoint this alias maps to **`dpl_8uG5d7ejAfWx8a1NijTxZpdr4b56`**, READY, **old commit `3e4c5856757d77a815690615e42bb769f4b0def5`**, NOT PR #23 HEAD. Exact-origin checks may reject temporary Vercel URLs. Do not call old preview equivalent to latest code. No automatic alias promotion.
- Staging read-only counts at checkpoint: **0 profiles, 0 listings, 0 listing-media metadata records, 0 student groups**. Do not invent hosted user acceptance or customer traction. `listing-media` and `avatars` buckets are **public**. Existing photos would be accessible by public URL regardless of listing RLS.

## Completed / staged work, with appropriate verification level
1. Claude independently audited twice. Product classification: **internal alpha**, not closed beta. Previous cross-group group-message RLS leak was real, reproduced, corrected in staging by `fix_student_group_message_rls`, and tested with PGlite cross-group and removed-member scenarios.
2. Staging migration `private_profile_and_explicit_cities` makes new profiles nondiscoverable by default; removes database city defaults; account UI no longer assumes Berlin; student chooses city, filters and Bot queries use it. Existing profiles were NOT retroactively de-discovered; migration intentionally preserved prior records.
3. Staging migrations `listing_integrity_guard` and `enforce_complete_listing_integrity`: server-owned listing chronology, EUR restriction, required prices, trim-aware valid city, consistency between housing rent and display price, no deleting active listing details, deferred transaction checks, archived-reopen protection. PGlite negative tests pass; hosted acceptance still absent.
4. Former PR #18's rate-limit and community-related migrations are now present in the active branch. Staging has `private.consume_action()` and `private.limit_student_actions()` and safety triggers for listings, messages, reports, job applications; actual hosted adversarial exhaustion and concurrency testing remain.
5. Staging `gate_unreleased_community_writes`: disabled user API execution of unfinished Events/Trips/other gated community RPCs; no fabricated fully working Jobs/Trips/Events publishing.
6. Staging `student_group_owner_removal_bans`: durable owner removal, owner restoration, voluntary rejoin preserved, message-insert and join serialization; UI moderation controls added. Database policy/triggers read back, PGlite and mocked browser checks passed. Independent two-real-account hosted tests and race load tests pending.
7. Mascot UI changed from cropped picture toward full-body blinking animated bot and smaller floating launcher. Bot searches real Supabase data deterministically and read-only; **NO integrated external LLM, tool-using agent or private-data access**. Current UI/UX/viewport quality still needs device-level qualification.
8. Client photo privacy: `src/listings/mediaSanitizer.ts` and `src/listings/ListingWorkspace.tsx` strip metadata and validate bytes before direct upload; regression tests verify outgoing request content. **NOT A TRUST BOUNDARY:** direct Storage API still accepts user uploads to a public bucket; visible pixels can reveal personal info.

## CURRENT ACTIVE WORKSTREAM — trusted media server and cutover (NOT LAUNCHED)
**Do not drift into AI providers, landing-page redesign, Stripe, deals or other categories yet.**

Files newly added on draft PR #23:
- `supabase/functions/listing-photo-intake/core.ts`: dependency-injected, testable owner-check/size/quota/transcode/upload/cleanup/delete coordinator.
- `supabase/functions/listing-photo-intake/index.ts`: Supabase Deno Edge handler with server-side JWT validation, allowlisted origin, service-role key server-side only, magic-byte/type checks, bounded multipart body, candidate WASM ImageMagick decode/auto-orient/downscale/re-encode PNG, extra ancillary metadata filtering and compensating cleanup.
- `supabase/functions/listing-photo-intake/deno.json`: Deno config; Expo `tsconfig.json` excludes ONLY Edge `index.ts`, retaining `core.ts` typing. GitHub mandatory independent `trusted-media-edge` Deno check.
- `tests/web/trusted-media-core.spec.ts`: mocked dependency contract, cross-owner rejection, quota, failed storage, cleanup on DB failure and deletion behavior. Unit/fake tests DO NOT prove live decoder security.
- `supabase/migrations/20261022183000_listing_media_six_photo_guard.sql`: transaction-lock-serialized six-photo maximum and trigger-level ownership, path and listing kind/status checks, including privileged service writes. Recent commits `509213c`, `130c6e8`, `c847760` tightened those checks and negative assertions; all three CI jobs passed at `c847760f`.
- `docs/STUORA_TRUSTED_MEDIA_CUTOVER_2026-10-22.md`: detailed rollout and risk matrix.

**IMPORTANT STATE:** latest SQL six-photo migration is **NOT applied** to staging (verified absent in migration history and `pg_trigger`); the `listing-photo-intake` Edge Function is **NOT DEPLOYED** (staging lists no Edge Functions). The current UI STILL uploads directly to the public bucket. The new Edge entrypoint has a fail-closed `STUORA_TRUSTED_MEDIA_ACTIVATION=STAGING_APPROVED` flag, with default disabled if someone mistakenly deploys it. DO NOT activate yet.

**Unfinished security requirements before any public media cutover:**
1. Review ImageMagick WASM version, actual runtime/bundle/CPU limits; run real decoder and output tests for JPEG EXIF orientation/GPS, WebP XMP, PNG ancillary chunks, alpha, corrupt images, decompression bombs, 320px/mobile and iOS/Android. Deno `check` proves TS syntax/imports, NOT runtime safety.
2. Implement **durable server-side upload-attempt quotas** before decoding, including failed uploads, concurrency, user/IP abuse and global memory/CPU budget. `private.consume_action` exists but beware SQL transaction rollback on errors: failed attempt counts must persist or use an independent rate-limit boundary. The **six-photo stored-row quota does NOT rate-limit attempts**.
3. Validate all trusted upload actions against final listing owner/status and path in the database, with real two-account JWT negative tests. Review races between listing archive/delete, in-flight uploads and deletion/cleanup; reconcile service-role bypass to RLS.
4. Coordinate staged app change away from `storage.from('listing-media').upload` and owner direct metadata inserts/deletes; then in same controlled cutover revoke direct client Storage writes/metadata writes. Never lock out legitimate uploads on the old approved web preview.
5. Decide private versus public delivery; public URLs are nonrevocable immediately and may be cached; design archive/report/account-erasure lifecycle, object cleanup and audit/retry logic. Do not pretend decoded PNG removes visible identifiable content or guarantees privacy.
6. Document/test migration parity of repo vs actual staging, run SQL on **staging only after exact-head required CI all green**, use read-only preflight (table/object counts and existing policies), then apply minimal reviewed migration and read back. Do not blindly `supabase db push` because historical migration version IDs differ.
7. Keep code feature-disabled until hardened and qualified under isolated staging, no production use or marketing claims.

## Important acceptance/operations blockers
- **Hosted real two-account tests NOT executed**: `playwright.hosted.config.ts`, `tests/hosted/browser/real-two-student.spec.ts`, `docs/STUORA_REAL_TWO_STUDENT_ACCEPTANCE_2026-10-18.md`, GitHub issue #25. Require two separately verified private staging student accounts + explicit fixture-write approval `STUORA_STAGING_ACCEPTANCE=I_APPROVE_STAGING_TEST_WRITES`; NEVER put credentials in chat/commits/logs; verify cleanup.
- Security/multi-user: authentication recovery, RLS/Realtime group/conversation isolation, abuse quotas and concurrency, moderation/reporting, student verification, privacy & deletion/export/retention, photo storage access/caching, operational alerts/logs, incident response, GDPR/DSA review and live performance.
- Live preview behind Vercel access/origin restrictions; inspect before promising a demo. Need full navigation/buttons/320px hero fix, accessible UX and genuine mobile-device testing. UI web export and native JS export are not actual phone acceptance.
- Future website: separate credible public landing page with real screenshots and no fake testimonials, after core is stable.
- AI provider evaluation (e.g. Groq/Cloudflare Workers AI, other region-appropriate providers) and secure server-only AI gateway are future, not active. No hardcoded data.
- Student Savings partnerships/deals **explicitly deferred**, Stripe blocked by user's lost-phone MFA, no payment service changes, no infrastructure purchases or production modifications unless independently approved.

## Engineering rules (non-negotiable)
- Read actual code/data/CI before edits, preserve existing contracts, fix root causes, add positive **and negative** auth tests, verify exact HEAD and deployment SHA; no speculative green claims.
- Keep PR #23 draft; don't merge or rewrite main. Avoid Lovable/Supabase assumptions from other products; Stuora has its own dedicated backend.
- No credentials or private student records in code, chats, docs, tests, logs or screenshots. Don't bypass 2FA, weaken RLS, disable a gate, deploy undeclared capabilities, invent user counts, fake partner offers or call Stuora 100% GA-ready.
- Treat unknown facts and failed tests as UNVERIFIED, not PASS. If exact-head CI is red, repair it before deployment.
- When continuing, **do concrete next engineering steps**, not merely another generic audit or new scaffold.

## Required NEXT action when a fresh chat begins
1. Read THIS document and `docs/STUORA_TRUSTED_MEDIA_CUTOVER_2026-10-22.md`, `docs/STUORA_SCHEMA_RECONCILIATION_2026-10-22.md`, `docs/LISTING_MEDIA_CHECKPOINT.md`, `docs/STUORA_REAL_TWO_STUDENT_ACCEPTANCE_2026-10-18.md`; inspect PR #23 head, latest CI, latest DB migrations/policies, Vercel alias; do not rely on old checkpoint SHAs.
2. Reconcile the media six-photo guard with current staging; its database-level tests pass at reference SHA but it has NOT been staged. Inspect SQL and actual schema/trigger definitions; only apply to STAGING after current exact-head green CI, explicit impact check and safe isolation.
3. Prioritize implementation/negative tests of durable media-attempt abuse protection and live image decoder correctness. Keep Edge **not deployed/disabled** until runtime and permission qualification.
4. Produce concise verified progress: exact commit, full three-job CI outcome, staging migration version if applied, file/trigger read-back, blocked release gates, and next safe task.

**Release decision:** INTERNAL ALPHA ONLY. No public beta, GA, uncontrolled real-student signup, LLM/payment/deal activation or production deployment.

## 2026-10-22 checkpoint after 3281232 (supersedes stale above migration status)
- Staging `uptjcspizukpjcoayhtn` has two **applied** and read-back migrations: `listing_media_six_photo_guard` as `20261022095358`, and `listing_photo_attempt_limits` as `20261022095425`. Public listing-media bucket and direct client upload remain UNCHANGED. Edge image service remains UNDEPLOYED. Production UNTOUCHED.
- PR #23 stayed draft/unmerged. Commit `3281232478a0c2fe5cb924cbf9f900b32214ea34` passed all three required CI jobs in run `39757771599`.
- Vercel created READY Preview deployment `dpl_8sDLaQjD9FXnzGaFsqzBYuQ8u2di` at `https://stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app/`. The actual user browser rendered a **blank page**, not a qualified preview. App `src/backend/config.ts` fails before React mount when `window.location.origin` differs from build-time `EXPO_PUBLIC_STUORA_WEB_ORIGIN`; exact runtime console diagnosis remains unverified.
- Preview build correction in follow-up commit: `scripts/build-vercel-web.mjs` derives the **single immutable preview deployment origin** from trusted `VERCEL_URL`, only for `VERCEL_ENV=preview`, `EXPO_PUBLIC_STUORA_ENV=staging` and the exact dedicated staging Supabase project. It preserves exact-origin checks and refuses production/wrong-team hosts. This only addresses the immutable deployment URL (not arbitrary branch aliases). `vercel.json` uses this wrapper and CI adds negative tests.
- NEXT: verify exact new commit CI, auto-created Vercel preview SHA and actual browser startup (not just READY). Never claim runtime fixed until confirmed in user browser. If still blank, inspect Chrome DevTools Console and Network, including HTTP content-type. No production/project merge.

## 2026-10-22 — Persistent student Saved listings (implementation candidate)
- Housing and Marketplace now use the **existing** RLS-protected public.saved_listings table for save/unsave, persisted account state and a filtered Saved listings view. A PostgREST `listings!inner` join returns only the user's saved **active, visible** listings. No new tables, RLS policies, image upload changes or external services.
- Browser API contract tests added for both categories; database assertions verify cross-student read/write/delete isolation. Mocked browser tests are **not real hosted two-account acceptance**.
- Still INTERNAL ALPHA: media processing runtime/cutover, verified Jobs/Trips/Events workflows, moderation, email deliverability, real two-account tests, native-device checks, external API and generative LLM gateway and commercial operations remain unqualified. No AI provider or payment activated.

## 2026-10-22 — New trusted decoder hardening candidate
- The dormant Edge media path now contains header-level JPEG/PNG/WebP dimension checks **before ImageMagick.read**, plus independent real-WASM Deno codec tests. No Edge deployment or Storage cutover is authorized merely by source CI. Consult `docs/STUORA_TRUSTED_MEDIA_CUTOVER_2026-10-22.md`. Staging database already has photo guard and rate-attempt migrations; production remains unchanged. The approved app's current direct upload continues.

## 2026-10-22 — Trusted-media concurrency/cleanup candidate
- New candidate SQL migration `20261022210000_listing_photo_processing_leases.sql`: three-minute database processing leases, max one per student and four project-wide; service-role only. Must be independently applied to **staging** only after exact-head CI green and migration read-back. Currently source-only until confirmed.
- `listing-photo-intake/index.ts` acquires a DB lease before decode and releases in `finally`; `core.ts` compensates uncertain Storage upload outcomes. No Edge deployment, no client cutover, no production modifications. CI/mock DB tests do not substitute for hosted acceptance.

## 2026-10-22 — Lease negative test correction after CI failure
- Commit `4317689b3152faabd842948f1c1e8195738f5959`, CI run #39794167750: trusted-media-edge PASS, `rls-authorization` and `verify` FAIL at `tests/database.test.mjs:260` because the supposedly wrong-student release passed the legitimate `p_student` to the privileged RPC. This is a test-fixture error, NOT evidence of a server-side cross-account bypass. Follow-up corrects the student argument and adds negative persisted-lease and expiry checks. Do not apply the new migration to staging until exact successor passes all three CI jobs.

## 2026-10-22 — Processing-lease migration APPLIED AND VALIDATED (staging only)
- Source code commit `84466977213940b9f86b858ab5ffeb22afb114b3`: GitHub Actions run [#39795925488](https://github.com/stanleymay20/Stuora-/actions/runs/39795925488) has overall SUCCESS; all **individual job steps** read back complete/success for `verify`, `rls-authorization`, `trusted-media-edge`. GitHub job list had transiently stale queued statuses: rely on individual completed job steps as confirmation.
- Applied `supabase/migrations/20261022210000_listing_photo_processing_leases.sql` on dedicated staging project `uptjcspizukpjcoayhtn` ONLY via apply_migration. Actual applied Supabase migration name `listing_photo_processing_leases`, assigned version **`20261022144118`**. Production `mljmifovcthvtuquvyzf` remains UNTOUCHED.
- Readback: `private.listing_photo_processing_leases` has RLS enabled, table SELECT privileges for anon/authenticated = FALSE; both `public.acquire_listing_photo_processing_lease(uuid,uuid)` and `public.release_listing_photo_processing_lease(uuid,uuid)` are SECURITY DEFINER but EXECUTE is denied to anon/authenticated, allowed to service_role only.
- Live staging SQL behavioral test PASS: four distinct students admitted simultaneously; fifth denied; second simultaneous request for same student denied; cross-student release denied and original lease retained; correct release admitted a new user; expired lease reclaimed. Test fixtures used random UUIDs, were deleted afterwards, and left **zero active leases**. These SQL tests exercised database logic as privileged executor, NOT an authenticated hosted HTTP request or multi-replica Edge WASM CPU/memory measurements.
- Staging `listing-photo-intake` Edge Function still **NOT DEPLOYED** (list returns []); direct Storage photo upload remains in place with public listing-media bucket. Activation flag remains closed. PR #23 remains DRAFT, UNMERGED. No client, Storage policy, external LLM, payment or production changes.
- Next gate: user-authorized staging-only disabled Edge deployment; verify real hosted startup under 256-MB memory/CPU constraints with feature flag closed, exact Supabase environment secret boundaries, supervised two genuine staging test accounts and hard negative security tests. Do NOT turn on feature or perform direct-upload cutover before hosted acceptance; consider race and cleanup reconciliation, moderation and signed-url design.

## 2026-10-22 — Staging Edge release lock predeployment candidate
- Added `supabase/functions/listing-photo-intake/releaseGate.ts` with compile-time disabled uploads/deletes. No environment variable alone may enable the service, and only the exact dedicated staging Supabase URL is accepted at startup. Staging-disabled startup no longer requires an unsupplied optional `STUORA_ALLOWED_WEB_ORIGIN` secret.
- `processor.test.ts` now tests that even the nominal activation string cannot bypass the compile-time disabled flag. No user data should be sent during this milestone. Deploy as JWT-protected disabled-only service *only after exact-head CI proves all three required jobs succeeded*.
