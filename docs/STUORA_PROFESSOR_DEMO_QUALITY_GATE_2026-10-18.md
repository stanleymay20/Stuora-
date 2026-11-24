# Stuora — Professor demonstration quality gate (18 October 2026)

## Purpose
Present a **verifiable English-language engineering prototype**, not a fictional populated marketplace or a commercial-GA claim. The evaluator values reliability, deterministic outcomes, complete functionality, and evidence. Reduce the demonstration scope instead of masking defects.

## Controlled source and release boundary
- GitHub: `stanleymay20/Stuora-`. Latest reviewed implementation is the combined **draft PR #23** (Stuora Bot) built on draft #22 (Groups) and #21 (UI); these have not been merged into `main`.
- Public staging preview: `https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app` (the exact approved web origin). Do not use the hashed deployment hostname, which may be deliberately rejected by frontend environment isolation.
- Staging Supabase project: `uptjcspizukpjcoayhtn`. **Production** Supabase project is different and must not be modified for a classroom demonstration.
- Exact-head CI pass means only the automated set passed. It is **not a real user account / hosted UI acceptance**, and passing bundle exports is not physical-device qualification.
- Show Stuora Bot only after its current draft's exact-head CI is green, staging deploy is READY and alias is verified. Explain it is **deterministic, read-only connected search**, not yet generative AI.

## Academic product thesis (English)
Stuora is an independent student-life platform: student → city → people → housing → things → experiences → opportunities.
The problem: student services are fragmented, difficult to trust, and often costly.
The approach: authentic student listings, opt-in communities, constrained actions, row-level data protection, and tested cross-platform workflows.
Core student participation remains free; potential B2B revenue streams are **pricing hypotheses**, not paying customers.

## Minimum safe 7-minute walkthrough

| Time | Live demonstration | Acceptance criterion | Fallback |
|---|---|---|---|
| 0:00–1:00 | Explain scope and architecture (Expo/React Native Web, Supabase, Vercel) | Truthfully explain the current stage | Local architecture screenshot |
| 1:00–2:00 | Open Home; test navigation; browse Housing and Marketplace | No uncaught error or impossible CTA; active empty states truthful | Tested CI recording |
| 2:00–3:00 | Search by city/price; illustrate how backend filters work | Show actual listing only if one was legitimately created; otherwise show the empty state | Inspect Playwright contract and RLS tests |
| 3:00–4:00 | Profile sign-in, account gate, authenticated listing form | **Never** show synthetic live-user data as authentic; sign-in must work before audience | Tested browser-account contract |
| 4:00–5:00 | Groups: public directory, explicit join/sign-in gate, discussion permissions | Owner and nonmember restrictions enforced; don't suggest the DB is populated | Hosted rollback SQL fixture |
| 5:00–6:00 | Stuora Bot beta: real DB search + no-results, safe category navigation | Must be deployed from exact-head CI green; read-only/no fictitious results | Bot tests and code explanation |
| 6:00–7:00 | Commercial roadmap, student-first value, missing GA gates | Acknowledge unfinished Jobs/Events/Trips posting, billing and real AI | This document |

## Critical real-account preflight (unverified until performed)
1. Create **two dedicated staging accounts**, A and B, with access to their real email inboxes. Verify email callback works. Never fabricate verified identities; do not use production.
2. Complete both student profiles. Mark demo content clearly as staging-only examples.
3. A creates one clearly labeled example Housing listing and uploads/removes an allowed image. Reload and verify persistence, city/price filters, true image retrieval, edit and archive.
4. B discovers A's listing and initiates the correct private listing-scoped conversation. A replies. Both refresh and verify delivery.
5. B attempts prohibited edits/deletes and read access outside a conversation; these must fail. SQL rollback fixture passing is **not** equivalent to live two-browser acceptance.
6. A creates a group; B joins, sends a message; outsider cannot read discussions. Founder moderation/delete must work. Check sign-out invalidates access.
7. Refresh the preview, verify responsive 320px and desktop layout, keyboard navigation and clear failure states.
8. Remove demo content or retain it explicitly as staging demo content; never claim that the listings represent students in the market.
**Stop the classroom demo and use a recorded test if any of these fail during rehearsal.** No credentials, access/refresh tokens, secret/API keys, private messages, or student emails should be exposed on slides.

## Hard release gates / stop conditions
- **P0:** Broken enabled button, leaking private data, bypassable RLS, incomplete email/real auth flow, failed exact-commit CI, staging-API 5xx, lost edits, cross-account access, or accidental production configuration.
- **P1:** Responsive text clipping, missing content labels, inaccessible input/action, runaway API requests, missing retry paths, unreviewed photographs/rights.
- **Do not** un-gate Trips/Jobs/Events publishing, activate Stripe, add student-deals integrations, enable an unmetered model, buy cloud services or deploy production as part of the demo.
- Correctly describe user-populated categories as empty when no real records exist.

## Verification evidence pointers
- Read the exact head and CI log from PR #23, not an earlier green run.
- CI: `.github/workflows/ci.yml`, Playwright `tests/web/{ui,account,bot,groups,listings,messaging}.spec.ts`, SQL authorization `tests/database.test.mjs`.
- Hosted rollback-only staging fixtures: `tests/hosted/listings.sql`, `tests/hosted/groups.sql`.
- Product qualification: `docs/STUORA_GA_UI_ROUTE_AUDIT_2026-10-18.md` and `docs/STUORA_STUDENT_GROUPS_GA_2026-10-18.md`.

## Short presentation statement
"Stuora is a technically controlled prototype that connects students with housing, secondhand goods, student groups and opportunities through real database-backed functionality. We prioritize deterministic behavior, authentic data, server-enforced permissions and repeatable automated tests. The assistant currently performs safe read-only searches; advanced AI, partner billing and additional category publishing are separate gated releases."

## Required next milestone
Record a screenshot/video of the **exact current approved staging deployment** and a green exact-head CI report, then run real two-account browser tests before describing the app as a dependable end-to-end student service. Do not call commercial GA.
