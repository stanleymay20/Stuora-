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
| Browser favicon / PWA icons | Not configured in Expo | Export PNG favicon from canonical vector and wire `web.favicon`; avoid SVG in `web.favicon` because Expo image utility may reject it |
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
