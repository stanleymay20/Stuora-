# Stuora

Stuora is a cross-platform student-life app for web, iOS, and Android.

The product is intentionally independent of university systems. The first MVP focuses on practical student life: community discovery, housing, marketplace, trips, jobs, messaging, and a portable trust/profile layer.

## Current MVP shell

The current branch implements a functional local-state vertical slice with:

- Home and local Berlin discovery
- Explore by Housing, Marketplace, Trips, Jobs, Events, and People
- Search and category switching
- Create flow that publishes a new listing into the running app state
- Contextual messages demo
- Stuora Passport profile/reputation concept
- Responsive web layout plus mobile navigation
- One Expo codebase targeting web, iOS, and Android

No fake payments, fake verification backend, or fake production services are exposed. Those will only be enabled after their end-to-end backend flows exist.

## Stack

- Expo SDK 57
- React 19.2
- React Native 0.86
- React Native Web 0.21
- TypeScript 6

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

The next production slice should add Supabase-backed authentication, profiles, listings, media uploads, messaging, row-level security, moderation/reporting primitives, and seeded demo data while preserving the working shell.
