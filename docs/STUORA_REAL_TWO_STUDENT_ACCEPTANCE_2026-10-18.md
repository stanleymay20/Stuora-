# Stuora real two-student staging acceptance — opt-in only

**Status:** test harness implemented, **not executed** with real credentials. It is not commercial GA evidence until one complete unmocked run passes and the two-account, email-confirmation and cleanup logs are reviewed.

## What is tested
- Two separate **real, verified test student** accounts use independent Playwright browser contexts.
- **Fail-closed backend origin guard** on both browser contexts, installed before login: only `uptjcspizukpjcoayhtn.supabase.co` may receive Supabase network requests. A wrong Supabase project is aborted, and both contexts must show actual staging requests. The guard never prints authorization headers, credentials or tokens, and does not mock responses.
- After each account signs in (creating a profile only when needed), the test reloads the page and verifies the authenticated profile and display name persist.
- Existing signed-in accounts must work against the **approved staging origin only** (no production calls).
- A publishes an explicitly marked staging Housing listing, and B discovers it after persistence/reload without owner edit controls. **No photo upload is performed** by core acceptance: direct public Storage intake is not approved until the trusted-media service is activated and qualified in a separate security gate.
- B starts a persisted owner conversation, sends a message, and A receives it in Messages.
- A creates a public group, B cannot access discussion before joining, B joins and sends a message, A reads it, and B leaves. **After reloading**, B must again be a nonmember and cannot read the former group discussion or post messages.
- The suite archives its test listing and deletes its group in `finally`. Cleanup failures **fail the acceptance run** with staging fixture labels; manually verify storage objects and staging data afterward. An interrupted process can still leave fixtures requiring manual cleanup.
- No mocked Supabase requests, no false student verification flags, no live money, no Stripe, no student-deals code. The separate trusted-media acceptance plan must prove image decoding, MIME-content security, cross-user raw Storage API denial, private-object access and revocation once the service is enabled. A host-only guard catches unexpected `*.supabase.co` requests but does not replace direct two-token REST/Storage negative authorization tests or validate custom-domain external destinations.

## Prerequisites — private and local
1. Two distinct email inboxes with accessible, already-confirmed, **dedicated staging** Stuora accounts. Don't use real customer identities, your real accounts, your professor's details or any email accounts you cannot independently access.
2. Owner explicitly authorizes creating and removing clearly labeled test records in the dedicated Stuora staging project.
3. The checked-out draft commit must have passed CI. Independently verify from the connected Vercel project deployment details that the immutable URL is **READY** and its full 40-character `githubCommitSha` matches `git rev-parse HEAD`. Then set the exact URL and SHA in session-only environment variables below. The guard checks hostname/origin and consistency with checked-out HEAD, but cannot independently attest Vercel without the operator's verified deployment readback. No stale preview aliases or production.
4. GitHub checkout is the actual PR branch. Node.js 22+ and `npm ci`; Playwright Chromium installed via `npx playwright install chromium`.

## PowerShell (Windows): run one explicit acceptance pass
Use temporary environment variables for the shell session only. No passwords in Git, Playwright config, browser recordings, screenshots, logs, ChatGPT, or URLs.

```powershell
$env:STUORA_STAGING_PREVIEW_URL = Read-Host "Exact current Stuora Vercel deployment URL (no trailing slash)"
$env:STUORA_VERIFIED_DEPLOYMENT_SHA = Read-Host "Full 40-character commit SHA verified from this Vercel deployment"
git rev-parse HEAD # Must match the Vercel deployment SHA above
$env:STUORA_STAGING_ACCEPTANCE = "I_APPROVE_STAGING_TEST_WRITES"
$env:STUORA_TEST_STUDENT_A_EMAIL = Read-Host "Staging student A email"
$env:STUORA_TEST_STUDENT_B_EMAIL = Read-Host "Staging student B email"
$a = Read-Host "Staging student A password" -AsSecureString
$b = Read-Host "Staging student B password" -AsSecureString
$env:STUORA_TEST_STUDENT_A_PASSWORD = [System.Net.NetworkCredential]::new("", $a).Password
$env:STUORA_TEST_STUDENT_B_PASSWORD = [System.Net.NetworkCredential]::new("", $b).Password
npx playwright test -c playwright.hosted.config.ts
Remove-Item Env:STUORA_STAGING_ACCEPTANCE,Env:STUORA_STAGING_PREVIEW_URL,Env:STUORA_VERIFIED_DEPLOYMENT_SHA,Env:STUORA_TEST_STUDENT_A_EMAIL,Env:STUORA_TEST_STUDENT_B_EMAIL,Env:STUORA_TEST_STUDENT_A_PASSWORD,Env:STUORA_TEST_STUDENT_B_PASSWORD -ErrorAction SilentlyContinue
```

**Important:** A failed test should be treated as a blocker even if automated mocks pass. Playwright tracing, screenshots and video are explicitly disabled for this suite to avoid recording passwords. Check the terminal and staging data afterward. Never run it with production credentials or a production URL.

## Unresolved items
- Real email confirmation and recovery need separate, supervised qualification.
- Native iOS and Android devices need physical testing; bundle exports alone are insufficient.
- Housing photo upload and public decoding are **explicitly excluded** from this core suite. The source-level locked, disabled trusted-media Edge Function requires separate hosted resource tests and an approved secure Storage/client cutover before any photo-upload acceptance. After cutover, test raw Storage negative authorization, MIME/size failures, revocation after archival, and orphan cleanup.
- Moderator/report and account-block controls, accessible keyboard flows, and global errors still need real user checks.
- Billing and AI model inference remain off. Discounts/deals integrations are explicitly deferred.

## 2026-10-22 — Exact preview identity and split media acceptance
- Hardcoded historic preview was removed from both hosted Playwright config and test. Each opted-in run requires an immutable `https://stuora-preview-<deployment>-stanleymay20s-projects.vercel.app` origin, a separately Vercel-verified full commit SHA matching the actual checked-out Git HEAD, and two distinct staging-only test accounts. A mismatched or non-Stuora preview fails **before any login or writes**. There is no default live host.
- **Operator responsibility:** independently read the Vercel deployment details (URL, Git SHA, READY) and enter both values. This source guard validates supplied identity/checkout consistency; it does **not** cryptographically query Vercel to prove the supplied SHA came from the URL. Exact preview identity must be independently recorded in the acceptance evidence.
- Removed public Storage photo upload from the core two-account run while the trusted-media service is compiled-off; photo security has its own mandatory gated acceptance path. The core suite still tests real listing publication, two-account discovery, messaging, groups, revocations, cleanup and role separation. No test accounts, user records or uploads were created by this source change.

## 2026-10-22 — Actual two-JWT HTTP quarantine denial runner
- `scripts/verify-stuora-media-quarantine.mjs` is an **operator-only, opt-in** live security test: it signs in two distinct, already-confirmed dedicated staging users with the same environment variables used by the two-student UI suite; no real customer or professor accounts. It pins **all requests** to `https://uptjcspizukpjcoayhtn.supabase.co`, requires the staging publishable key (never service/secret key), and deliberately tests anonymous-proof authenticated HTTP endpoints.
- It verifies independently for each JWT: direct `POST /rest/v1/listing_media` fails specifically with `403 / 42501` (not a foreign-key failure); raw `POST /storage/v1/object/listing-media/{user}/{verified-owned-listing}/{random}.png` fails with an RLS/authorization response; and the exact public path is `404`. Only a safe constant 1-pixel image is submitted; paths are uniquely generated. If the upload unexpectedly succeeds, it attempts owner cleanup and **fails hard**, requiring manual orphan investigation. A failure never prints passwords, JWTs, emails, user IDs or backend payloads.
- **Local PowerShell only; never use CI secrets or paste credentials into chat.** After setting the two distinct staging account credentials from the preceding section, set `$env:STUORA_STAGING_PUBLISHABLE_KEY` through a secure local source and `$env:STUORA_MEDIA_NEGATIVE_APPROVAL = 'I_APPROVE_DENIAL_PROBES'`. Execute `node scripts/verify-stuora-media-quarantine.mjs` and unset both variables afterward. `STUORA_STAGING_ACCEPTANCE=I_APPROVE_STAGING_TEST_WRITES` is also required. Stop if actual backend errors differ from expected checks; do not modify the test to accept a 5xx, FK error or public object.
- CI runs **only mocked** `tests/media-quarantine-http.test.mjs` to assert staging-only host, two JWTs, deny decisions, hostile responses and zero network before approval. A passing mocked test does **not** constitute the real hosted two-account acceptance gate.

- The HTTP denial runner now rejects redirects on every request, including login and cleanup. A redirect is an inconclusive failure, never permission to forward credentials or payloads to another endpoint.

## Required existing listing fixtures for HTTP quarantine acceptance (2026-10-23)
The original nonexistent-listing Storage path was insufficient: the legacy owner policy also rejects nonexistent listings. Before running the HTTP runner, use the normal staging UI to prepare one clearly labeled active Housing or Marketplace listing for each dedicated test account, under the existing explicit fixture-write authorization. The runner does not create or archive these listings. Supply their IDs locally:

```powershell
$env:STUORA_TEST_STUDENT_A_LISTING_ID = Read-Host "Existing active staging listing ID owned by student A"
$env:STUORA_TEST_STUDENT_B_LISTING_ID = Read-Host "Existing active staging listing ID owned by student B"
```
Both accounts and listing ownership/kind/status are validated before any media write probes. Metadata denial still uses a random nonexistent listing and requires permission-denied 42501. Storage denial uses the existing owned listing, so missing ownership is not the intended reason for rejection. Avoid modifying/archiving fixtures during the run; concurrent changes make results inconclusive. Afterward archive the dedicated fixture listings through the staging UI, verify cleanup, and unset both listing-ID variables along with the other test environment variables. Unexpected Storage success remains a hard failure with best-effort object deletion and mandatory manual verification.
