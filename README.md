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

The current app connects Auth, profiles, Housing and Marketplace to the dedicated Stuora backend. Other modules remain explicitly labeled demos. It includes:

- Home demo previews and live Housing/Marketplace discovery
- Explore by Housing, Marketplace, Trips, Jobs, Events, and People
- Search and category switching
- Persistent Housing/Marketplace create, read, edit and archive with owner authorization
- Local demo creation for Trips, Jobs and Events
- Contextual messages demo
- Account signup/login/logout, session persistence and saved private/public profiles
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

The reviewed migrations are applied to the dedicated Stuora project `mljmifovcthvtuquvyzf` in Frankfurt, in a separate organization. The app uses its publishable key only.

## Stack

- Expo SDK 57
- React 19.2
- React Native 0.86
- React Native Web 0.21
- TypeScript 6
- Supabase/Postgres for Auth, profiles and Housing/Marketplace

## Run locally

Requirements: Node.js 22.13 or newer.

```bash
npm ci
# Configure .env.local for a local or separate staging backend; see .env.example.
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
4. Postgres authorization regression tests (three users + anon, including inherited grants)

## Next engineering slice

Auth and profile editing now use the dedicated backend. Next, qualify real email confirmation and native-device authentication, then replace local listing state with repository-backed persistence, followed by media uploads and realtime messaging.

## Controlled backend checkpoint

Auth and profiles now use the dedicated backend. Hosted profile allow/deny tests pass and security advisors are clear. Desktop/mobile web account contract tests and iOS/Android bundle exports are in CI. See `docs/AUTH_PROFILES_CHECKPOINT.md` for verification scope and remaining release qualifications.

The **You** tab supports account creation, sign-in, persisted sessions, profile creation/editing, discovery privacy and logout. Other content is explicitly labelled demo; publishing there remains local to the running app session.

See `docs/LISTINGS_CHECKPOINT.md` for the current verification evidence and release limitations.

## Environment isolation

Backend configuration is mandatory. Development uses local Supabase; staging uses a separate hosted project; production uses the controlled Stuora project and an exact approved HTTPS web origin. No development, preview or test build defaults to production. CI browser contracts use `https://stuora-test.invalid`, intercepted by Playwright. See `docs/ENVIRONMENT_ISOLATION.md` for build settings and qualification limits.

## Engineering governance

Stuora development follows the proposed [engineering standards](ENGINEERING_STANDARDS.md), [architecture boundaries](ARCHITECTURE.md), and [contribution workflow](CONTRIBUTING.md). Use the [release checklist](RELEASE_CHECKLIST.md) and the existing [commercial GA release gate](docs/GA_RELEASE_GATE.md) to distinguish code-complete from safely releasable. See [architecture decision records](docs/adr/README.md) for rationale; these governance documents take effect after their review PR is merged.
