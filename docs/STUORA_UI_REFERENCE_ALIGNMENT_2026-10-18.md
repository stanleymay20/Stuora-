# Stuora visual-reference alignment — controlled GA implementation plan
Date: 2026-10-18
Source of truth: user-supplied side-by-side screenshots of (1) deployed Stuora Preview profile screen and (2) aspirational design board showing mobile onboarding, Home, Housing, Marketplace, Trips, Jobs, desktop discovery, messaging, and profile.
Status: Phase 1 candidate (NOT GA; unmerged, requires exact-head CI + hosted acceptance).

## Non-negotiable product rules
- Stuora is the independent trusted local network for student life outside the university.
- No seeded or fabricated users, ratings, housing, products, employers, trips, messages, prices, and verification badges in production.
- Each visible action must be connected to a verified end-to-end contract; unsupported features remain gated or explicitly unavailable.
- Preserve existing app and repository, Auth/RLS boundaries, migrations, security gates, and data privacy. No design-only mock flows.
- iOS, Android and web must remain accessible, responsive and deterministic.
- No production deploy/merge based on green CI alone; accept on actual browser and devices before release.

## Reference-to-implementation audit
1. Brand identity: gradient Stuora mark and purple/cyan/ink palette already in src/ui/Brand.tsx. Retain.
2. Desktop discovery: reference uses horizontal top navigation, prominent Berlin skyline hero, clean photo-first cards, and compact categories. Phase 1 implements top nav while retaining actual Home/Explore/Messages/Profile actions and current Berlin asset.
3. Mobile: reference uses bottom navigation and category discovery. Existing Expo responsive UI already has these; mobile-device visual acceptance required. No screenshots of true device runtime yet.
4. Housing/Marketplace: reference is photo-first. Existing real backend listing media is supported. Phase 1 improves cards and truthful empty states; display user-supplied real listing photos only.
5. Auth: reference includes Google/Apple options. DO NOT add buttons until OAuth providers, redirect handling, user agreements and device tests are configured. Current verified email/password, signup and recovery remain.
6. Trips, Jobs, Events: current persisted/posting flows remain gated; no mock cards or fake participation. PR #18 and category-posting migrations require separate security and end-to-end approval.
7. Messages: real authenticated listing-linked conversations; no mock chats, unread totals or avatars.
8. Profile: Phase 1 adds real display name/city/status/bio header; no fabricated followers, post counts, ratings or verified status.
9. Saving/liking, map, messaging call buttons and notifications: do not show nonfunctional icons. Implement complete persisted functionality and access control first.
10. Location: Berlin hero is brand visual, not inferred live location. City field from profile when present; do not imply location service is active.

## Implementation
- Branch: design/stuora-reference-ui-phase1-20261018, based on PR #20 recovery head 6cd944e153dd51c175f943cd32cf5ebcd191bfd9
- App.tsx: replace wide sidebar with desktop horizontal navigation; preserve category actions and existing responsive mobile navigation.
- src/listings/ListingWorkspace.tsx: photo-first live listing cards, explicit zero-result state.
- src/account/AccountPanel.tsx: authenticated true-data passport header, retain recovery isolation.
- tests/web/ui.spec.ts: desktop navigation regression; existing tests cover no fake data and responsive layout.

## Remaining work / release gates
- Exact-head GitHub CI (typecheck, database security tests, Playwright desktop/mobile-web, iOS/Android exports).
- Hosted Vercel Preview screenshot comparison at exact reviewed commit, screen widths 375px/390px/768px/1280px, interaction click-through on real staging backend.
- Review keyboard access, contrast, image fallback, visible error states and no horizontal overflow; test Safari/iOS and Android devices.
- Staging Auth redirect URLs + outbound email configured; signup/login/reset and multiple-account isolation acceptance.
- Finish real Trips/Jobs/Events/People and new features only via their own reviewed end-to-end vertical slices.
- Store compliance, monitoring/alerting, backup restore exercises, abuse/reporting controls, moderation, privacy documents and terms.
- Leave GA flag off until all required evidence is captured.
## Phase 2 candidate — discovery to genuine first listing
- Reuse the existing authenticated `save_student_listing` RPC and `ListingWorkspace` create mode; do not make a parallel posting system.
- Home and Explore empty-result surfaces now provide category-specific posting buttons that navigate to the existing secure create gate.
- Filtered search zero-results display a Clear search action, not a misleading “no community listings” state. It resets the actual Supabase title filter.
- Mobile Home reuses the actual Berlin image as a responsive hero instead of a plain placeholder while preserving functional search, categories and accessibility.
- Preserve no-listings copy in both desktop and mobile existing tests, plus assert unauthenticated Create goes through login/profile gating.
- Real database content remains empty in staging until actual student-created listings or isolated QA fixtures arrive; do not seed production with mock marketplace inventory.
- Phase 2 acceptance: exact-head CI green, deploy preview only, verify old approved branch-domain mapping safely, compare 390 px mobile and 1280 px desktop screenshots. No merge or GA claim without full evidence.

## Phase 3 candidate — branded visual discovery (2026-10-18)
- Generated a private conversation asset kit `Stuora_UI_Visual_Asset_Kit_2026-10-18.zip` (10 original subjects, optimized to 480/960px WebP).
- The ZIP is **not** committed to GitHub; do not point application code at temporary sandbox paths, and do not claim photographic images are deployed.
- Add these assets only after verified repository upload via the existing protected review workflow; prefer static Expo `require()`, accessible alternative copy and tested responsive crops.
- Safe image slots: welcome/community header, category editorial banners, authenticated account welcome, empty Housing/Search/Messages illustrations. Never display them as actual offers, actual students, ratings, jobs, events or trips.
- Meanwhile, `src/ui/CategoryArtwork.tsx` provides original vector graphics using the installed `react-native-svg` dependency, so all six category tiles and headings work on web, iOS and Android without new binaries or external hosts.
- `App.tsx` now shows more descriptive category banners, an explicit search action as well as Enter-key submit, and a functional path to Housing from unavailable categories.
- `ListingWorkspace.tsx` empty screens use safe category illustrations. Real listings still render uploaded listing media exclusively.
- Required qualification: exact-head CI (including new Playwright navigation/search assertions), responsive visual comparison and auth/data smoke checks in Vercel staging; physical native acceptance outstanding.

## Phase 4 — People and RLS-backed community discovery (2026-10-18)
- People: `src/people/PeopleDirectory.tsx` now uses only opt-in profile fields `id,display_name,city,bio`; supports server-side city/name filtering and detailed public profiles. Direct user-to-user messages, private data exposure, fabricated badges and fabricated profile counts are NOT enabled. Existing listing-scoped messaging stays intact.
- Trips/Jobs/Events: `src/community/CommunityCatalog.tsx` uses existing **staging tables** `public.listings`, `trip_details`, `job_details` and `event_details` in a read-only path, restricted to `status='active'` and the correct listing `kind`. It offers server-side title/city search, reload, paginated results, detail views, and honest empty states. No writes, joins, RSVPs, applications, or fake data.
- App labels now say **Posting soon**, not that the entire category is inaccessible. Full publishing is explicitly gated.
- Supabase staging project **uptjcspizukpjcoayhtn** confirmed only eight foundational migrations applied; security advisor reported zero lints. No additional DDL was applied to this project.
- The unmerged PR #18 candidate `dd67cbe646a0990ac9a5d93d48efaf40ddb49a78` already includes real category create/edit, attendance, job applications, user blocks, reports, and rate-limiting, with a prior passing GitHub workflow. Do **not** duplicate its stores or apply migration `20261012182717_complete_category_posting_release.sql` as a routine UI change; it affects security-definer routines, grants, RLS, Storage, messaging and rate limits and was explicitly held for broader approval.
- Safe progression: (1) review isolated migration and server privilege diffs, (2) qualify in an approved disposable or designated staging DB with read-back advisor and negative-RLS tests, (3) integrate the PR #18 contracts/code onto the current reviewed UI head without clobbering auth/recovery and scroll fixes, (4) run exact-head CI and hosted two-account end-to-end tests, (5) only then promote category write flags. No production mutation without explicit approval.
- Generated image candidates remain in the separate `Stuora_UI_Visual_Asset_Kit_2026-10-18.zip`. Confirmed source assets and optimized versions exist locally, but they have NOT been uploaded to GitHub. The UI currently uses original SVG artwork. For real asset integration, use permanent repository binaries and verify their SHA256 against the manifest, not time-limited CDN URLs, temporary sandbox paths or unreviewed external hosts.
