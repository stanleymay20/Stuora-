# Stuora environment isolation

Base: verified `main` b916940570594b21c9e20333f91a0ebedc631a14 (PR #16). Full post-merge CI run 38197555929 passed.

## Root cause and change

The client previously defaulted to the production URL and publishable key when Expo configuration was missing, and rejected every other backend project. A local/preview build could therefore silently read or write production under a real student's session. Browser contracts also used the production hostname, making incomplete interception unsafe.

The client now requires `EXPO_PUBLIC_STUORA_ENV`, `EXPO_PUBLIC_SUPABASE_URL`, and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Hosted environments also require `EXPO_PUBLIC_STUORA_WEB_ORIGIN`. Validation runs before client creation, through npm start/web/ios/android/export:web hooks, and in CI before exports. The build validator loads Expo env files with the relevant NODE_ENV. All keys must be publishable; legacy JWT, service-role and secret key formats are rejected.

| Mode | Backend | Web origin |
| --- | --- | --- |
| development | http://localhost:54321 or http://127.0.0.1:54321 | local development |
| staging | explicit separate HTTPS Supabase project, never the production project | exact configured HTTPS origin |
| production | https://mljmifovcthvtuquvyzf.supabase.co only | exact configured HTTPS origin |
| test | https://stuora-test.invalid with fixture publishable key only | local Playwright server on port 4173 |

A production bundle copied onto a preview/local origin fails before constructing the client. A staging mode pointed at production also fails. CI exports are test artifacts, unsuitable for deployment; they deliberately contain no reachable backend URL. Native production/staging bundles require the same explicit backend mode but have no browser origin; physical device qualification remains required. A local native loopback configuration requires a reachable local Supabase instance and is not a substitute for hosted/device qualification.

## Deployment configuration

Configure the four variables in the intended hosting environment before building. Production requires its real publishable key and actual approved origin. Use a separate staging project and staging key for preview builds. Do not copy `.env.example` placeholder values into a hosted deployment. Configure Auth redirects and SMTP on each selected backend independently and qualify real email delivery.

Use `npm run check:environment -- production` before a hosted export, then `npm run export:web`. The validator catches syntax and cross-environment mistakes; it cannot prove that a syntactically valid key belongs to the selected project or that the hostname is owned. Live Auth/REST acceptance must prove those properties. Configuration checks are accident prevention; authorization remains enforced by Auth/RLS.

## Fresh GA evidence and open blockers

2026-10-12 read-only hosted inspection found the controlled project ACTIVE_HEALTHY, all 17 public tables with RLS enabled, no security-advisor findings, and all eight repository migrations recorded on the backend. Performance advisories were informational unused-index notices; removing indexes on a new project is not justified by that evidence.

Only the controlled production project is visible through the Stuora connection. No real staging project, production domain/redirect/SMTP acceptance, or physical-device test was evidenced. This slice removes accidental production defaults; it does not claim that hosted staging has been provisioned or qualified.

Further mandatory work remains: server-enforced block/report/moderation and messaging abuse limits (no corresponding block/rate routines were found), real multi-account hosted acceptance, private/archived media URL lifecycle (current buckets are public), observability and rollback, tested recovery/backups, production performance, legal/support review and physical iOS/Android acceptance. Stuora remains pre-GA.
