# Stuora brand parity and rollout

**Canonical source:** `src/ui/Brand.tsx` (the app's existing `StuoraMark`). Its exact three paths and four gradient stops are mirrored in `assets/stuora-mark.svg`. Preserve this identity. No competing or generic platform logos.

| Surface | Status | Next evidence |
|---|---|---|
| Account, signup, recovery and profile UI | Stuora-branded in code | Hosted QA, accessible browser and physical device |
| Student-facing auth errors | Stuora-specific, stable error codes | Required Playwright regression, real stale-token/error acceptance |
| Auth email HTML and subject | 13 complete templates in source | Apply only in staging hosted Auth; test real recipient inboxes |
| Email sender and From display name | **Not configured/verified** | Verified sender domain, SMTP, SPF/DKIM/DMARC, deliverability |
| Verification and password-reset links | Existing provider confirmation links | Approved Stuora web origin, exact redirects; optional custom Auth domain |
| App icon and native splash | App is named Stuora but no icon files in Expo config | Generate 1024px PNGs from canonical vector; add to `app.json`, verify Android adaptive safe zone and iOS |
| Browser favicon | Branded 64×64 PNG asset committed and `web.favicon` configured in Expo | CI export and hosted favicon/metadata readback |
| Website/social share cards | Standalone landing page separate | Real public domain and verified social preview assets |
| Support/legal sender links | Unknown/unverified | Real Stuora-controlled support/privacy/terms URLs, never invent |

## Nonnegotiable criteria
- Keep student Auth separate from infrastructure names. Supabase remains a technical dependency, not student-facing identity.
- Do not set up fake sender addresses such as `no-reply@stuora.com` unless domain ownership and SMTP authentication have been confirmed.
- No new Supabase SQL migration can change hosted Auth SMTP templates; use the correct hosted Auth settings/API with permission.
- No source-only templates are represented as live; no production activation before genuine staging inbox acceptance.
- Do not use `assets/stuora-mark.svg` directly as `web.favicon` in Expo; render production-quality branded PNG assets in source first.
- Keep staging Edge `listing-photo-intake` version 2 disabled, PR draft, production unchanged.

See `supabase/auth-branding/README.md` for controlled Auth email rollout.

## Native application icon implementation
- `app.config.js` invokes a deterministic, dependency-free source renderer in `scripts/generate-stuora-native-icons.cjs` before Expo resolves app config. It writes 1024×1024 icon, Android transparent adaptive foreground and centered transparent splash asset to ignored `assets/generated-stuora/`.
- `app.json` now references a branded iOS/top-level icon and a branded Android adaptive foreground/background. The generated splash icon is **prepared but not yet wired**; installing and configuring the `expo-splash-screen` config plugin requires dependency review and native preview validation. Do not claim an OS splash or app-store build exists based only on generated assets.
- Mandatory CI tests generate and validate images using only Node built-ins, check PNG type/dimensions, ensure source mark parity, and verify Expo references. Actual launcher render on physical iOS/Android still needs acceptance. Generated PNG output is never committed from a local session or served to an unapproved backend.

## SDK 57 native splash-screen activation (source, 2026-10-22)
- Using the **recommended supported Expo SDK 57 package** `expo-splash-screen@57.0.10` and its native config plugin, not the deprecated root `expo.splash` configuration. Package metadata and exact published SHA512 tarball integrity were checked before editing lockfile. Existing dependencies (`@expo/config-plugins@57.0.11`, `@expo/image-utils@0.11.6`, `xml2js@0.6.0`) are reused.
- Uses the approved generated transparent `assets/generated-stuora/splash-icon.png`, centered at 220px over navy `#17152F`, identical for light/dark. No network image/third-party/logo replacement. The `app.config.js` generator runs before Expo loads config.
- CI's required `tests/native-branding.test.mjs` now verifies package/config/lock integrity and the generated PNG. Mandatory npm ci, Expo web/native exports, dependency compatibility and browser tests must succeed before the configuration is considered build-verified.
- **Not yet physically verified:** a native bundle export is not the same as an installable signed release binary. SDK 52+ Splash behavior may differ in Expo Go and development builds. Validate on actual **release-build** iOS and Android devices before GA (safe-area, scale, dark mode, launch transitions, app resume). Expo docs: https://docs.expo.dev/versions/v57.0.0/sdk/splash-screen/ .
