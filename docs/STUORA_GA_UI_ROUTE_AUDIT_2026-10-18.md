# Stuora controlled GA/UI/UX audit — 2026-10-18

**Status:** INCOMPLETE / NOT COMMERCIAL GA. This is a living evidence record for the existing Expo Web/iOS/Android application, not a certification. No new scaffold or parallel app was created.

## Exact system audited

- GitHub: `stanleymay20/Stuora-`; UI work lives in **draft PR #21**, `design/stuora-reference-ui-phase1-20261018`. **Draft PR #18** contains separately controlled Events/Trips/Jobs publishing; do not merge or unlock on UI evidence alone.
- Deployed testing: Vercel Preview project `stuora-preview`; staging Supabase project `uptjcspizukpjcoayhtn`. The production Supabase project and the production website are separate. No production changes authorized.
- Expo SDK 57, React Native 0.86, Expo Router **not installed**. Original navigation used local in-memory React tab state. A lightweight, web-only query-route adapter now supports `?stuora=` links, history and category reload. Preserve Supabase auth URL query/hash during navigation; native tab selection stays native.
- CI: `.github/workflows/ci.yml` checks install, dependency auditing, config/environment isolation, Expo dependencies, database authorization tests, typecheck, web bundle, Chromium Playwright desktop & Pixel 7 mobile-web, and iOS/Android JavaScript bundle exports. Passing bundles **do not certify native device functionality**.

## Navigation, routing, control matrix

| UI | Entry/route | Primary action and backend | Status and required evidence |
|---|---|---|---|
| Home | root URL, Home tab | Community hero search, category tiles, real Housing/Marketplace previews, See all and post | Existing mocked browser regression. Hosted screenshots/manual acceptance required. |
| Housing | `?stuora=housing` | Search, city, maximum rent, refresh, real listing detail, create/edit/archive/photo, message owner | Mock E2E + rollback hosted `tests/hosted/listings.sql` pass. Two real authenticated-account hosted journeys outstanding. |
| Marketplace | `?stuora=marketplace` | Search, city, max price, listing CRUD/photo/message owner | Same qualification gap as Housing. |
| Trips | `?stuora=trips` | Real database discovery and details; joining/publishing gated | **NOT fully operational**: PR #18 remains unmerged; security/rate limits and multi-account hosted acceptance needed. |
| Jobs | `?stuora=jobs` | Real discovery/details; posting/applying gated | **NOT fully operational**, review employer authenticity/moderation and GDPR. |
| Events | `?stuora=events` | Real discovery/details; event creation and RSVP gated | **NOT fully operational**, review time zones, attendance ownership and abuse flows. |
| People | `?stuora=people` | Opt-in public profile browse/details, name/city filters | Mock browser regression; privacy fields restricted; no general user-to-user direct-message action. |
| Create Housing | `?stuora=create-housing` | Signed-in account + public profile validation, real RPC and photo upload | Hosted user acceptance still needed. |
| Create Marketplace | `?stuora=create-marketplace` | Same | Hosted user acceptance still needed. |
| Messages | `?stuora=messages` | Listing-scoped, private conversations, send/reload | Conversation handoff regression and RLS test exist. Two real browsers/accounts required. |
| You | `?stuora=profile` | Signup/sign-in, opt-in privacy, recovery, edit profile | Fake backend regression; real email delivery, recovery and verified OAuth provider testing outstanding. |
| Student Savings | Header/mobile modal | Real verified-benefit browse with refresh/error states; no invented values | Mock service regression; actual merchants, redemption and regional rights qualify separately. |

**Review branch changes this phase:**
- Shareable web routes, Back/Forward support and reload persistence; invalid routes safely fall back home. No React Router/Expo Router replacement.
- Category changes scroll to the top rather than retaining stale Explore scroll position.
- Labeled search inputs; accessible selected state for mobile navigation/category chips; larger `See all` tap targets; restored visible input focus outlines.
- Expanded Playwright route matrix, Back/Forward tests, all primary tab controls, and viewport-overflow audit at 320/360/390/768/959/960/1024/1280/1600 px.
- Corrected stale Create-page text that claimed photo upload was hidden despite active listing-media flows.

## Safety, privacy, database controls

Staging read-only checks:
- RLS enabled on `profiles`, `listings`, `listing_media`, `conversations`, `conversation_members`, `messages`, `event_participants`, `trip_participants`, `job_applications`.
- Security Advisor: one **INFO** notice on `private.action_limits` (RLS enabled with zero policies). Check that it is legitimately internal-only; do **not** weaken RLS to silence the notice. Documentation: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- Performance Advisor: 17 unused-index **INFO** notices. The staging database is nearly empty; index usage is not yet measurable. Do **not** delete security/performance indexes blindly.
- Staging has zero real `profiles`, `listings`, `messages`, and `conversations`. Synthetic browser fixtures do not prove a real hosted transaction across two users.
- Community posting schema migrations exist, but verified UI publishing and participation for Trips/Jobs/Events are **not yet unlocked**.
- User-supplied Housing/Marketplace/Trips/Jobs/Events category images are editorial only. Commercial image licenses, attribution and GDPR/model releases where applicable must be verified before production redistribution.

## Pipeline audit / evidence gaps

**Existing CI gates:** exact PR-head checkout, dependency audit with failure tests, backend environment validator, database authorization, typecheck, Expo dependency check, web build, Chromium desktop/Pixel 7 mocked-account E2E, native JavaScript bundle export.

**Not yet proven:** iOS/Android real-device flows and app-store packaging, Safari/Firefox accessibility, automated visual-diff approval, Lighthouse/Core Web Vitals targets, hostile multi-account hosted auth + RLS from separate clients, actual email/OAuth delivery, real external payment lifecycle if later enabled, hosted upload MIME/security round trip, moderation & abuse handling, external image rights, rollback and production observability, production build from latest exact main, GA owner sign-off.

**Deployment discipline:** Only deploy an exact PR-head commit after required CI success. Verify Vercel reports READY **before** moving the approved Preview alias. Do not merge PR #21 or #18 without resolving their integration/security conflicts, reviewing the exact head, and receiving release approval. Never infer production GA from a Preview screenshot.

## Operational next steps / block list

- **P0:** Real two-account staging acceptance: create account, verify email, complete profile, publish/edit/archive Housing/Marketplace, upload/retrieve/remove media, begin exact listing conversation, send/reply, verify forbidden cross-account reads/writes, sign out, clean test data.
- **P0:** PR #18 actual merge-conflict resolution, security-definer function grant and policy audit, idempotent staging SQL tests, and each Events/Jobs/Trips create/participate/application path with malicious negative cases. Do not expose incomplete actions.
- **P1:** Native iOS and Android acceptance on physical devices, auth callback and scrolling, accessibility audits including screen-reader and keyboard traversal; record screenshots at 320/390/768/1024/1600 at 100% browser zoom.
- **P1:** Hosted web monitoring, performance/error budgets, deployment/rollback process, photo licensing evidence.
- **P2:** Richer experience and conversion UX only after real inventory exists; never add fabricated testimonials, students, jobs, trips, ratings or messages.

**Rule:** CI-green means the tested code passed its defined tests, not that every route and commercial requirement is 100% complete.
