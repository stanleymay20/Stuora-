# Real data checkpoint

Continues verified main f1edd2dd3ebe6f97b9df78a6bc69314ca1f46ba2.

No seeded listings, people, conversations, benefits or account savings totals
are shipped in the runtime experience. Session-only publishing is removed.
Home reads Housing and Marketplace from the same persisted backend as Explore.
Create offers only the two categories with verified create/edit/archive flows.
Trips, Jobs, Events and Messaging explicitly state that they are unavailable;
there are no fake join, apply, publish or send controls.

People reads only id, display_name, city and bio from opted-in profiles and
requires authentication. Existing RLS remains the authorization boundary.
Savings reads verified student_benefits; current validity is enforced by RLS
using database time. It displays recorded sponsor/source, prices, eligibility,
validity and terms. Savings differences use integer cents. Missing information
is disclosed. Redemptions and personal totals are unavailable; no stored money
or fabricated amount is shown.

Both new read paths have loading, empty, failure/retry, refresh, deterministic
created_at/id ordering, paginated reads, request cancellation and a 15-second
request timeout. No database grants, policies, schema or CI gate were changed.
Branding, static UI copy, category configuration and decorative city artwork
remain bundled assets; they are not business records or listing photos.

## Verification and acceptance limits

- Strict TypeScript, web/native production exports and 136 Postgres assertions.
- 26 desktop/mobile browser contracts cover account and listing persistence,
  People sign-in boundary, explicit public fields, retry/reload, verified offer
  retrieval, exact price/savings calculations, empty results and unavailable
  publishing/messaging. Fixtures exist only in tests.
- Live hosted policies inspected; anonymous verified-benefit SQL query succeeds
  with zero offers. No partner offer was invented or inserted.
- Live HTTP: Housing, Marketplace and verified-benefit reads return 200 with
  no records; anonymous profile reads return 401. Phone viewport qualification
  follows deployment. Local online Expo check hit a proxy timeout; offline
  compatibility check passed. The unchanged online CI gate must still pass.

This is not full professor-demo acceptance. Successful real email confirmation,
a genuine two-account create/discover/edit/archive test across clients, media
uploads, secure messaging and native-device runtime remain release qualifications.
An HTTP failure must never be replaced by sample records. An empty market must
remain empty. Merge only the exact reviewed head after complete CI succeeds.
