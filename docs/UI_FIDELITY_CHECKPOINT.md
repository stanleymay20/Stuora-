# UI fidelity checkpoint

Continues verified main `1963f8e210818ae6603386ab56bb7df2d02316f9` in the existing Expo app.

The shared ribbon mark and native SVG icons replace unreliable Unicode glyphs.
Mobile Home has four category tiles per row, search, live Housing discovery and
clearly labeled demo previews. Desktop retains its sidebar and adds a bundled
Berlin photo hero. Email authentication gains a welcome banner without advertising
unconfigured social login. See assets/README.md for photograph provenance.

Demo cards now open labeled detail previews. Demo conversation search works;
the composer explicitly states that secure messaging is not implemented.
Fabricated notification and send controls were removed. Auth, profile editing,
Housing/Marketplace ownership, validation and archive flows are preserved.
No backend policy, migration, release gate or CI workflow was changed.

Validation: 22 desktop/mobile-web browser cases, 136 Postgres authorization
assertions, strict TypeScript, Expo compatibility, production web export and
both native bundle exports. Browser backend contracts are mocked; native exports
are compilation checks, not device tests. Screenshot review includes Home and
email welcome screens on both viewport sizes.

## Hosted preview

The existing app is now hosted for phone testing in Vercel project
`stuora-preview` (`prj_P56IpJmpGcA86f3EIBiJtQ2bLUSE`). The prior deployment
`dpl_JEBCNHUBJytrgUFZQZrbpNczDVzR` contains main 1963f8e. Deploy only the
merged, verified code and fresh Expo export. Preserve deployment protection;
use an expiring share link for phone review. Do not commit access tokens.

This supersedes the earlier checkpoint statement that no hosted web deployment
exists. Hosting does not establish production readiness: live email confirmation,
allowed Auth redirect origins and native-device operation still need verification.
Housing and Marketplace are persisted text listings. Media uploads, real messaging,
persistent Trips/Jobs/Events and verified Savings are still outstanding. Empty
live markets remain empty; decorative Berlin photography is not listing media.
