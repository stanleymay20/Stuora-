# Stuora — Gen-3 audit remediation, AI and partner data (2026-10-23)

Branch `fix/stuora-gen3-audit-remediation`, stacked on `feat/stuora-ai-business-foundation-20261018` (PR #23).
Update: all eight migrations are now applied to staging; see `STUORA_GEN3_STAGING_CHECKPOINT_2026-10-23.md`. Functions, secrets and optional provider switches remain pending. Production is unchanged.

## What changed

| Area | Finding | Fix |
|---|---|---|
| Photo intake | N-01/N-02 one student could exhaust global/listing windows | Per-student windows first, owner check before listing window (`20261023010000`) |
| Photo intake | N-04 lease held while body uploads; JPEG output kept metadata risk | Body read under a 15 s deadline before the lease; output re-encoded to stripped WebP with a container guard |
| Moderation | D-11 reports had no workflow | `report_content`, `moderation_queue`, `moderate_report`, `lift_suspension`, notices, suspensions; suspended accounts cannot create content (`20261023011000`) |
| Messaging | D-07 archived listings kept accepting messages; 60/min limit | Closed-thread guard, 20/min + 300/day (`20261023012000`); UI shows closed state, block/unblock (`20261023017000`), report per message, Realtime with polling fallback |
| Directory | R-04 legacy `is_discoverable` without recorded consent | `discoverable_consented_at`, RPC-only changes, legacy rows hidden until confirmed (`20261023013000`); in-app banner |
| GDPR | D-10 no export; no erasure | `export_my_data()` (5/day); `delete-account` Edge Function (phrase + password re-verified server-side, 5 attempts/hour, removes Storage first) |
| Auth | Login CSRF via implicit `#access_token` links | PKCE everywhere (`flowType: 'pkce'`); native callback accepts only `?code=` and calls `exchangeCodeForSession` |
| Routing | `?stuora=constructor` crashed rendering | Own-property check + root `ErrorBoundary` |
| Bot | D-16 "near campus" taken as a city | Shared `isPlausibleCity`; last plausible candidate wins; city picker uses the same rule |
| UI | Contrast below AA; 106×134 bot covering phone content; filters queried per keystroke | Darker text tokens; 56 px mobile FAB; 300 ms debounce |
| Groups | Anonymous "Group member" labels; no way to remove an abusive author | Per-group pseudonym tags, "Remove author", report post, open-group disclosure |
| Legal | No Impressum / privacy notice / terms | `?stuora=privacy|terms|imprint|safety`; production build refuses placeholders |
| Review | Independent review of this branch | Reporters cannot read decision columns; suspension survives account deletion (email fingerprint); quotas need a confirmed email + profile; export limit works without a profile; exact provider domains, BA links only to arbeitsagentur.de; scanner decodes JWT payloads and fails closed |
| Ops | No security headers; no secret scan | `vercel.json` headers (CSP in Report-Only first), `scripts/scan-secrets.mjs` on repo and bundle in CI |

## New services (all optional, all server-side)

**LLM (intent parsing only).** `stuora-assistant` sends only the question text to Groq (`openai/gpt-oss-20b`, strict
JSON schema), falling back to Cloudflare Workers AI (`@cf/meta/llama-3.1-8b-instruct`), then to the on-device rules.
Model output is accepted only when every field is grounded in the question; the search runs with the student's own
JWT under RLS, and the answer text is deterministic. No name, email, message or result is ever sent to a provider,
and logs contain counts only. Quotas: 5/min and 40/day per student, 5,000/day overall.

**Partner data.** `external-data` provides:
- Nominatim city check (1 request/s globally, 30-day cache, identifying User-Agent, OSM attribution).
- Ticketmaster events (30 min cache).
- Adzuna jobs (requires a commercial licence flag; 30 min cache).
- Bundesagentur für Arbeit Jobsuche (1 h cache).
Quotas: 10/min and 200/day per student, 120/min overall. Only allow-listed provider hosts are linked.

## Operator steps (not done by this PR)

1. **Review, then apply migrations** `20261023010000` … `20261023017000` in filename order to *staging* with your normal migration
   process. Do not `supabase db push` to production from this branch.
2. **Set Edge Function secrets** (Supabase → Edge Functions → Secrets). Never in `EXPO_PUBLIC_*` or the repo:
   - always: `STUORA_ALLOWED_WEB_ORIGINS` (comma-separated exact origins)
   - assistant: `STUORA_AI_ASSISTANT=enabled`, `GROQ_API_KEY` (optional `GROQ_MODEL`),
     `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_AI_TOKEN` (optional `CLOUDFLARE_AI_MODEL`)
   - partner data: `STUORA_NOMINATIM_CONTACT` (a monitored email), `TICKETMASTER_API_KEY`
     (optional `TICKETMASTER_COUNTRY_CODE`, default DE), `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`,
     `ADZUNA_COMMERCIAL_LICENSE=confirmed`, `BA_JOBSUCHE_ENABLED=true`
3. **Deploy functions**: `delete-account`, `stuora-assistant`, `external-data`, and the updated `listing-photo-intake`.
4. **Grant moderators** by inserting their user ids into `public.moderators` with the service role.
5. **Flip public switches** in the web build: `EXPO_PUBLIC_STUORA_AI_ASSISTANT`, `EXPO_PUBLIC_STUORA_EXTERNAL_FEEDS`,
   `EXPO_PUBLIC_STUORA_CITY_LOOKUP` (each `=enabled`).
6. **Legal**: fill the `EXPO_PUBLIC_STUORA_OPERATOR_*` values, have a lawyer review the texts in
   `src/legal/LegalPage.tsx`, then set `EXPO_PUBLIC_STUORA_LEGAL_REVIEWED=confirmed`.
7. **Headers**: watch CSP reports on the preview, then switch `Content-Security-Policy-Report-Only` to enforcing.
8. Run the hosted two-student acceptance on staging (needs separate authorization).

## Provider caveats to settle before enabling

- **Groq**: turn on Zero Data Retention in the Groq console; sign the DPA. US transfer → DPF/SCCs in the privacy notice.
- **Cloudflare Workers AI**: covered by Cloudflare's DPA; US transfer.
- **Adzuna**: the free key is a 14-day evaluation. Commercial use needs a licence and visible attribution — hence the flag.
- **Bundesagentur Jobsuche**: the API is public but undocumented, with no published terms. Get written confirmation
  before `BA_JOBSUCHE_ENABLED=true` in production.
- **Ticketmaster**: Discovery API terms require attribution and linking back; 5,000 calls/day on the default tier.
- **Nominatim**: the public server forbids heavy use and autocomplete; the 1 req/s gate and 30-day cache keep within
  policy. Move to a hosted geocoder if traffic grows.
- PKCE: password-reset and confirmation links must be opened in the same browser/device that requested them.

## Verification run locally

- `npm run typecheck`, `npm run test:database` (PGlite, 11 suites), all `node --test tests/*.test.mjs`
- Deno: photo intake (12), shared/delete-account/assistant/external-data (17), `deno check` for the new entrypoints
- `npm run export:web`, secret scan of repo and bundle, Playwright desktop + mobile (including new `safety.spec.ts`)
