# Professor's three-section Stuora navigation proposal — 2026-11-22

## Source
Handwritten professor sketch supplied by the founder in the conversation. The drawing identifies three grouped UI areas:
1. **Groups** (university/class and business groups).
2. **People, Events, Trips** (we label the umbrella **Campus Life**; this label is a product interpretation, not a verbatim quote).
3. **Marketplace, Housing, Jobs** (we label the umbrella **Marketplace**).

Additional notes reference communication between classmates, networking and possible **GISMA-only** access using student card/number and a QR authentication method. The exact handwriting of some notes is uncertain, so do not invent an institution integration or claim approval.

## Implemented on this review branch
- The homepage now shows exactly **three primary discovery panels**, in sketch order. The panels keep the seven existing illustrated category buttons, real routes, backend connections, and feature readiness labels. Nothing was deleted.
- Explore has three primary section-selector controls above the existing category chips, so a category remains directly reachable for navigation, accessibility, and bookmarked links.
- Mobile and desktop layouts reuse existing images and screen implementations. Messages, Create, Account, City and Savings remain available as utilities: the design change is **three discovery spaces**, not a removal of safety or account navigation.
- New Playwright regression checks assert the membership and category routes of all three sections.
- The iOS TestFlight release branch was **not changed** by this UI experiment.

## Student-only GISMA identity: design proposal only (not implemented)
The sketch's number/card/QR idea must not be interpreted as equivalent to proof of enrolment. If the institution approves a pilot:
1. Determine current university naming, official consent, scope and acceptable proof (student email domain, number verified against an authorised university service, or signed QR issued by the university).
2. Validate identity server-side and bind it to a single account. A user-entered number or picture of a card alone must not grant verified status.
3. Use short-lived signed QR challenges if supported; avoid uploading/storing card photos by default, avoid public disclosure of student numbers, and define expiry/revocation for lost cards or alumni.
4. Keep production access independent of GISMA until the founder and university explicitly approve a restricted launch; do not lock out existing users through a UI refactor.
5. Obtain GDPR and university approval for identity processing; publish a clear privacy notice and retention plan.

## Release and review rule
This is a UI proposal, not a qualified release. Review on device, inspect CI, compare screenshots against the professor's sketch, and leave the iOS TestFlight 0.1.6 candidate unchanged until the signed candidate is evaluated. Do not claim university SSO, QR verification, or production feature parity.
