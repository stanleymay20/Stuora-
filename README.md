# Stuora

Stuora is a cross-platform student-life app for web, iOS, and Android.

The product is intentionally independent of university systems. The first MVP focuses on practical student life: community discovery, housing, marketplace, trips, jobs, messaging, and a portable trust/profile layer.

## Student-first rule

Stuora is designed to **reduce the cost of student life, not add another tax to it**.

Core participation should remain free for students wherever practical. Employers, professional housing providers, local businesses, travel partners, sponsors, and optional commercial tools should carry most of the economics.

Examples:

- job applications: free for students;
- ordinary peer-to-peer marketplace listings: free;
- core housing discovery: no Stuora student application fee;
- community, messaging, profile, and discovery: free core access;
- trips and events: prioritize student/group pricing;
- verified partner benefits: show the real normal price, student price, sponsor, terms, and validity period;
- no hidden fees.

See `docs/STUDENT_FIRST_ECONOMICS.md` for the full policy.

## Current MVP shell

The current app implements a functional local-state vertical slice with:

- Home and local Berlin discovery
- Explore by Housing, Marketplace, Trips, Jobs, Events, and People
- Search and category switching
- Create flow that publishes a new listing into the running app state
- Contextual messages demo
- Stuora Passport profile/reputation concept
- Responsive web layout plus mobile navigation
- One Expo codebase targeting web, iOS, and Android
- Student Savings overlay with category filters, transparent normal-vs-student pricing, sponsor and eligibility disclosure, validity dates, and computed savings totals

Seeded savings offers are clearly labelled demo data. Production offers must be verified before they can be presented as subsidized student benefits.

No fake payments, fake verification backend, or fake production services are exposed. Those will only be enabled after their end-to-end backend flows exist.

## Backend foundation

The repository now includes a Supabase/Postgres schema blueprint covering:

- profiles and student verification state;
- housing, marketplace, trips, jobs, and events;
- saved listings;
- trip participation;
- job applications;
- conversations and messages;
- reports/moderation primitives;
- verified student benefits and savings accounting;
- Row Level Security and explicit Data API grants.

The schema has **not** been pointed at an unrelated Supabase project. A dedicated Stuora project should be created before applying it.

## Stack

- Expo SDK 57
- React 19.2
- React Native 0.86
- React Native Web 0.21
- TypeScript 6
- planned production backend: Supabase/Postgres

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run web
```

For native development:

```bash
npm run ios
npm run android
```

## Quality gate

GitHub Actions verifies:

1. Expo dependency compatibility
2. strict TypeScript
3. production web export

## Next engineering slice

Create a dedicated Stuora Supabase project, apply and verify the schema with security/performance advisors, connect Auth and profiles, replace local listing state with repository-backed persistence, then add media uploads and realtime messaging.
