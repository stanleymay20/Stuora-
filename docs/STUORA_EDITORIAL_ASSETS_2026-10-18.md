# Stuora original editorial asset integration — 2026-10-18

## Provenance and usage
These are original AI-generated Stuora-branded editorial images, approved by the user for the UI. They are not actual users, verified students, homes for rent, marketplace offers, jobs, trips, or events. Never display generated promotional images as the media supplied by a listing owner.

The ten permanent, optimized, static assets are stored under `assets/editorial/` and referenced by `src/ui/EditorialImage.tsx` through static Metro `require()` calls for web/iOS/Android. They do not depend on time-limited signed URLs, external CDNs, or placeholder photos.

| Asset | Use |
|---|---|
| community.webp | Secondary student-community promotional image layered on top of existing Berlin skyline hero at wide desktop widths |
| housing.webp | Housing discovery card and Explore editorial header |
| marketplace.webp | Marketplace discovery card, Explore editorial header and empty state |
| trips.webp | Trips category artwork and no-trip empty state |
| jobs.webp | Jobs category artwork and no-job empty state |
| events.webp | Events category artwork and no-event empty state |
| people.webp | People discovery artwork and empty opt-in directory |
| empty-housing.webp | Housing empty state (no real listings) |
| empty-search.webp | Listing title search with no matches |
| empty-messages.webp | Empty real conversation inbox |

Original source material: generated Stuora Visual Asset Kit (2026-10-18). Edited small-device assets are optimized WebP. Retain the original kit separately for large marketing exports and any future high-resolution hero replacement.

## Data-integrity contract
- Every displayed housing, marketplace, event, job or trip listing stays Supabase-backed.
- Product cover photos are only listing-owned media, never editorial art.
- Public profile cards remain actual opted-in profiles, never synthetic photographs or reviews.
- No fake offers, participants, prices, application results, identities or verification labels.
- Trips/Jobs/Events discovery is read-only until the review-blocked migrations and participation/write flows are qualified in staging.
- The existing Berlin skyline photograph remains the main high-resolution hero; the community editorial image is an additional promotional visual, not a statement about actual customers.

## Release gates
- Exact-head TypeScript, Expo web export, desktop/mobile-web Playwright tests, and native iOS/Android exports.
- Browser image decoding and visual comparison at mobile and desktop widths.
- Real device smoke test, particularly WebP decoding on iOS/Android.
- Hostile database/Auth/RLS and publication checks before enabling writes and participation.
- Do not publish to production or label GA-ready based only on static exports.
