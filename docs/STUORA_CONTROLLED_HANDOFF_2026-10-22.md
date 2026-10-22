> **SUPERSEDED SNAPSHOT (2026-10-22):** This document describes an older October checkpoint, including an Expo 57 failure which has since been resolved. **For current verified release/security state, consult [STUORA_HANDOFF_LATEST.md](./STUORA_HANDOFF_LATEST.md) first.** Do not use the outdated next-step orders below without checking today's PR HEAD, CI, migration history and Vercel SHA.\n\n# STUORA — CONTROLLED CONTINUATION HANDOFF
**Snapshot date:** 2026-10-22 (Europe/Berlin). **Authority:** current GitHub/Supabase/Vercel evidence checked in this session. **Purpose:** allow a subsequent assistant/engineer to resume without losing the vision, replacing the app, misrepresenting verification, or drifting into unrelated features.

> Treat all commit IDs and status descriptions here as a timestamped checkpoint, NOT a substitute for reading live refs and CI. The code branch may advance. After this documentation commit, the latest PR head necessarily differs from the pre-documentation code snapshot.

## 1. Product vision and immutable principles
Stuora is an independent, cross-platform **student-life platform**: **student → city → people → housing → things → experiences → opportunities**. It should help students settle in, find affordable legitimate housing and working-student jobs, trade used goods, join genuine communities, attend events and trips, and eventually access transparently verified savings. It targets an initial Berlin market, with nearby Potsdam/Brandenburg as later extensions; global ambitions require local liquidity and proof before expansion.

**Students first.** Basic account, discovery, ordinary peer-to-peer Housing/Marketplace posting, applications, messaging and Group membership should remain free. Monetization should primarily be B2B: employers/recruiters, verified commercial housing providers, local businesses, event promotion, sponsored *clearly labeled* campaigns and optional tightly metered Stuora AI Plus. Example €39/€99 partner tiers and €3.99 AI Plus are *hypotheses*, not products, contracts, prices currently charged or validated revenue. Do not monetize access to private student records or charge job applicants. Cite `docs/STUDENT_FIRST_ECONOMICS.md`.

**Engineering doctrine:** Work as a principal engineer, not “vibe code.” Reverse-engineer existing interfaces, contracts, auth, data/RLS, storage, flows, CI, deployment, rollback and threats; fix root causes; add negative security tests; retain exact-head CI; preserve all working functionality. Never say “100% GA-ready” or “professor-demo perfect” without real evidence. Honest empty-state UI beats fictional students, listings, ratings or offers. Do not rebuild/scaffold a parallel Stuora.

The professor teaches **in English**. “German professor” conveyed an expectation of careful engineering, reproducible correctness and product quality, **not** a request to translate the presentation into German. A polished, narrow, fully working demonstration is preferred over showing unfinished features.

## 2. Exact repo, review branches and CI checkpoint
GitHub repository: **`stanleymay20/Stuora-`** — https://github.com/stanleymay20/Stuora-

* `main`: `839f8ca8f19a728aa50ec284a7302c868085f566` (verified 2026-10-22). Do not write/merge to `main` without explicit review/approval.
* **Draft PR #21** — https://github.com/stanleymay20/Stuora-/pull/21 ; branch `design/stuora-reference-ui-phase1-20261018`; head `f009a365965ca06abfd3f6948ef04bf5424352f1`. Reference UI, five user-supplied real editorial images, route/deep-link/browser history/responsiveness, E2E audit. Unmerged.
* **Draft PR #22** — https://github.com/stanleymay20/Stuora-/pull/22 ; branch `feat/stuora-student-groups-20261018`; head `ebad06ce096e210ec0a19981b07aa6a3c787118d`. Student Groups RLS, owner-controlled creation/edit/delete, membership, member-only discussion, moderation, quota safeguards, UI, PGlite + hosted rollback SQL tests. Unmerged.
* **Draft PR #23** — https://github.com/stanleymay20/Stuora-/pull/23 ; branch **`feat/stuora-ai-business-foundation-20261018`**, the **active combined implementation branch**, logically stacked on #22 and #21 though PR base is `main`. Pre-handoff-documentation code head **`8edef742871a1986b3ab715ab21c96d0e6be8686`**, timestamped 2026-10-21 22:29 UTC. This branch contains Stuora Bot, commercial-operating documentation, messaging paging/hardening and an opt-in real two-account hosted browser acceptance harness. Unmerged, draft.
* Last verified **green** exact-head CI on that combined branch: commit `7a0a15e8768c3d5af2c3116d62211bd177a79acf`, run **39140962338** (2026-10-18). Check run details afresh before relying on it.
* Most recent **pre-handoff code-head CI: FAILED** at `8edef742871a1986b3ab715ab21c96d0e6be8686`, run **39686813667** (2026-10-21). Failure is **`Check Expo dependency compatibility`**, not the Bot or hosted E2E run: `npx expo install --check` reports **`expo@57.0.30` but expects `~57.0.31`**. The package file pins `"expo": "~57.0.30"`. **P0 next action:** inspect Expo SDK 57 compatible dependencies, update `expo` using the official Expo-supported route, update **both `package.json` and `package-lock.json` consistently**, rerun dependency security, `npx expo install --check`, TypeScript, DB, browser + native export CI **on the exact new head**. Do not weaken CI/ignore the failure. Check for additional failures that were skipped due to this first gate.
* A handoff-only documentation commit may trigger a further CI run. It does **not** correct the dependency blocker; verify the latest head before any deploy/merge.

## 3. Deployment and backend isolation
* Approved **staging preview web origin**:
  https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app
* As of 2026-10-22 this alias read back to Vercel deployment **`dpl_5TTA8MmGrfPVS2Tud3t9oRzNyE5Q`**, READY, deploying **`7a0a15e8768c3d5af2c3116d62211bd177a79acf`** — an *earlier successful build*, NOT latest PR #23 head. The unique hashed deployment host may fail Stuora's exact-origin safety constraint: share only the approved alias and verify it after any promotion.
* Vercel project: `stuora-preview` / `prj_P56IpJmpGcA86f3EIBiJtQ2bLUSE`. Production not modified.
* Dedicated **staging Supabase** project `uptjcspizukpjcoayhtn`, connector link `link_6acabc01f5b481919b8c38570df3b911`; **production** is the separate project `mljmifovcthvtuquvyzf`. Never confuse them. Supabase backend is not Lovable-controlled for Stuora, unlike other apps.
* Staging migrations include verified foundation, real listings, private listing messaging, media, community kind/publishing and **`student_groups`** applied. Migration inventory checked 2026-10-22.
* Staging table counts checked 2026-10-22: **0 profiles, 0 listings, 0 student_groups, 0 direct messages, 0 group messages**. This means empty real UI is expected; never claim live student traction or fabricated users.
* No public/prod environment keys, passwords, service-role secrets, model keys or account access details belong in Git history or handoffs.

## 4. What is built, and what is NOT yet qualified
**Code implemented:**
- Expo SDK 57 / React Native Web 0.21 / React 19 / TS6 single cross-platform app.
- Auth/profile UI, strict web URL origin, staging/prod env separation, password recovery guarded UI.
- Genuine persisted Housing & Marketplace listing CRUD and images, listing-owner restrictions, listing-scoped conversations and Messages, newest-first paging with bounded older history and per-thread draft isolation (in combined draft).
- Real data browsing for Trips, Jobs, Events and People; **Trips/Jobs/Events posting and join/apply/RSVP remain gated pending release/safety qualification**, even if some migrations are present. Don't un-gate casually.
- Public student Groups: creator owns/edit/deletes, join/leave, member-private discussion, owner moderation and durable abuse quota ledger. No invitation-only private groups, video conferencing, etc.
- **Stuora Bot mascot** from generated design (`assets/stuora-bot.webp`), desktop/mobile entry and **deterministic read-only database search** for Housing, Marketplace, Jobs, Trips, Events and public Groups. It is **NOT** a generative AI model, real Qwen integration, autonomous agent, or unrestricted natural language system. No access to private messages, no auto publishing, no fake results; price parsing includes €1,200 / €1.200,50 / €650,50 regression tests.
- **Student Savings** surfaces genuine verified-only benefits when present, and correctly empty otherwise. No invented deals, redemption or discount partnerships.
- Regression: PGlite authorization, backend config, production dependencies, mobile/desktop Playwright, viewport navigation, group/message contracts, iOS/Android JS exports. Bundle exports are **not physical device app testing**.

**Unverified/missing:**
- **Real end-to-end hosted two-student acceptance**: opt-in test suite exists but has **NOT** run against two verified independent student logins. No genuine test credentials currently supplied; don't invent them. This is the next critical user-journey proof.
- Actual two-browser profile, housing upload/download/media path and persistence, cross-user messaging, group join/discussion/leave, authenticated email confirmation/recovery, malicious account restrictions, accessibility and full device qualification.
- Operational: consent/data retention/reporting/moderation/abuse process, telemetry (without exposing personal data), backups/restore, incident runbook, billing/chargebacks/consumer law, scalable hosting.
- Full server-side AI gateway, model provider Qwen/OpenAI benchmarking, cost ledger, RLS-scoped AI tools, permissions and rate-limit enforcement, and QA *not implemented*. Propose only as a guarded next slice.
- **Stripe on hold**: user lost iPhone and cannot finish Stripe login 2FA. Do not set up live checkout, credentials or transactions without restored account access and explicit approval.
- **Student deals explicitly deferred**: user mentioned GitHub Education, Duolingo, Lovable student deals as examples; DO NOT implement deals import, partner administration, redemption, fake partnerships or deal pages until explicitly reauthorized.
- Alibaba Cloud is a candidate for **both** lower total hosting costs and affordable EU-scope Qwen inference. Compare complete TCO/Frankfurt data-processing restrictions and model quality, do not buy/migrate from Vercel/Supabase without evidence and approval. AI spend ceiling proposed, not activated.

## 5. Real two-student acceptance harness
Read in repo (don't invent another test framework):
- `docs/STUORA_REAL_TWO_STUDENT_ACCEPTANCE_2026-10-18.md`
- `playwright.hosted.config.ts`
- `tests/hosted/browser/real-two-student.spec.ts`
- `tests/hosted/groups.sql` and `tests/hosted/listings.sql` (rollback-only DB fixtures; these have been executed successfully in prior turns, not evidence for live two-browser sign-up).
The hosted browser test requires two **real verified dedicated staging accounts**, two inboxes, and explicit `STUORA_STAGING_ACCEPTANCE=I_APPROVE_STAGING_TEST_WRITES`; secrets provided as local transient environment variables, not in chat, screenshots, traces, GitHub, commits or logs. It uses independent browser contexts, real server, staging-only labeled records, tries to clean up. Validate cleanup manually. Never run it automatically with generic credentials, in production, or on unsuspecting users.

## 6. Professor-demonstration scope
Read `docs/STUORA_PROFESSOR_DEMO_QUALITY_GATE_2026-10-18.md`. In English, demonstrate a carefully rehearsed **academic prototype** (architecture, verified navigation, genuine empty states/search, permissions, explicit development roadmap), not 100% commercial GA. Professor values robust quality over speed. Prepare honest fallback screenshots and truthful explanations if staging is empty. Prioritize fully proven Housing/Marketplace and Groups rather than advertising half-enabled Jobs/Trips/Events as complete. Show Bot only as read-only database search. Real two-account acceptance should precede claiming end-to-end readiness.

## 7. User priorities / explicit exclusions
1. Stability, engineering evidence, authentic student value, flawless routes/buttons/accessibility, safe UI/UX; no vague claims of “100%”.
2. Establish sustainable economics without taxing students; eventually paid Vercel/Supabase, business partner subscriptions, optional metered AI.
3. Proper Stuora AI *across the app* is the long-term vision; introduce incrementally, with typed server-side tools, clear citations to real data, user approval for all side effects, privacy/GDPR and strong budget controls.
4. Build student communities/groups, real housing/jobs/marketplace opportunities and verified beneficial connections; avoid fictitious supply.
5. **Do not touch Stripe, student-deals implementation, cloud purchases, real subscriptions, payment charges or production** unless specifically authorized.
6. Do not introduce secrets into code or provide insecure auth/2FA workarounds.

## 8. Immediate continuation sequence (no drift)
1. **Read this handoff**, latest PR #23 head, diff, PR #21/#22 topology, docs, and newest CI logs. Recheck all statuses; consider this document a checkpoint only.
2. **Fix the current Expo version mismatch**, update lockfile consistently and preserve dependency security; run exact-head CI. Review any subsequent red stage until entire run succeeds.
3. When green and reviewed, deploy **that exact Git SHA to existing staging Vercel project**; verify READY, alias mapping, no production mutation. Do not treat existing older green preview as latest.
4. Run rollback-only hosted RLS test/checks on dedicated staging if needed. The real two-browser suite needs explicit staging credentials/approval supplied securely; until then, improve deterministic tests and inspect remaining critical flows without claiming acceptance.
5. Fix P0/P1 issues found (auth, listing photo, message per-account privacy, group membership, navigation, keyboard and 320px responsive). Use regression tests for each.
6. Produce evidence-based professor demo acceptance matrix and screenshots/recording only if capture is authorized and does not expose student personal data.
7. Keep Stripe/deals/Alibaba migration on hold; plan future AI inference and B2B commercialization separately.
8. Leave all PRs in draft, don't merge, don't call GA; report exact commits, test IDs, deployment IDs, blockers and what remains to test.

### Main documentation pointers
`README.md`; `docs/STUDENT_FIRST_ECONOMICS.md`; `docs/STUORA_GA_UI_ROUTE_AUDIT_2026-10-18.md`; `docs/STUORA_STUDENT_GROUPS_GA_2026-10-18.md` (if present; check tree); `docs/STUORA_AI_COMMERCIAL_EXECUTION_2026-10-18.md`; `docs/STUORA_PROFESSOR_DEMO_QUALITY_GATE_2026-10-18.md`; `docs/STUORA_REAL_TWO_STUDENT_ACCEPTANCE_2026-10-18.md`.

### Verified current blocker / quick reference
At the 2026-10-22 checkpoint, **CI run 39686813667 failed on `npx expo install --check`: `expo@57.0.30` should be `~57.0.31`**. The previous preview is READY but running older green SHA `7a0a15e...`, while code branch had advanced to `8edef742...`. Do not lose this distinction during handoff.
