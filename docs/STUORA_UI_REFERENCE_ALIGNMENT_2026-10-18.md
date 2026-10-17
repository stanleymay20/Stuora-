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