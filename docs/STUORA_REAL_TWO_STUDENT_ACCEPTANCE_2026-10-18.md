# Stuora real two-student staging acceptance — opt-in only

**Status:** test harness implemented, **not executed** with real credentials. It is not commercial GA evidence until one complete unmocked run passes and the two-account, email-confirmation and cleanup logs are reviewed.

## What is tested
- Two separate **real, verified test student** accounts use independent Playwright browser contexts.
- Existing signed-in accounts must work against the **approved staging origin only** (no production calls).
- A publishes an explicitly marked staging Housing listing, uploads a PNG through real staging Storage, and verifies the image decodes after revisiting the listing. B discovers the same persisted listing and image without gaining owner edit or photo-removal controls; B reloads and fetches the image again.
- B starts a persisted owner conversation, sends a message, and A receives it in Messages.
- A creates a public group, B cannot access discussion before joining, B joins and sends a message, A reads it, and B leaves.
- The suite attempts to **remove the uploaded photo before archiving the listing** and delete the group in `finally`. Cleanup failures **fail the acceptance run** with staging fixture labels; manually verify storage objects and staging data afterward. An interrupted process can still leave fixtures requiring manual cleanup.
- No mocked Supabase requests, no false student verification flags, no live money, no Stripe, no student-deals code. A passing image-decode check proves fetchability of the staged PNG in Chromium, **not** cross-user raw Storage API denial, MIME-content security, public-object revocation, device gallery permissions, or permanent deletion guarantees.

## Prerequisites — private and local
1. Two distinct email inboxes with accessible, already-confirmed, **dedicated staging** Stuora accounts. Don't use real customer identities, your real accounts, your professor's details or any email accounts you cannot independently access.
2. Owner explicitly authorizes creating and removing clearly labeled test records in the dedicated Stuora staging project.
3. The expected draft commit has passed CI, the Vercel deployment is READY, and the **exact approved preview alias** maps to that commit. Rehearse in an English-language desktop browser. Only use dedicated test accounts.
4. GitHub checkout is the actual PR branch. Node.js 22+ and `npm ci`; Playwright Chromium installed via `npx playwright install chromium`.

## PowerShell (Windows): run one explicit acceptance pass
Use temporary environment variables for the shell session only. No passwords in Git, Playwright config, browser recordings, screenshots, logs, ChatGPT, or URLs.

```powershell
$env:STUORA_STAGING_ACCEPTANCE = "I_APPROVE_STAGING_TEST_WRITES"
$env:STUORA_TEST_STUDENT_A_EMAIL = Read-Host "Staging student A email"
$env:STUORA_TEST_STUDENT_B_EMAIL = Read-Host "Staging student B email"
$a = Read-Host "Staging student A password" -AsSecureString
$b = Read-Host "Staging student B password" -AsSecureString
$env:STUORA_TEST_STUDENT_A_PASSWORD = [System.Net.NetworkCredential]::new("", $a).Password
$env:STUORA_TEST_STUDENT_B_PASSWORD = [System.Net.NetworkCredential]::new("", $b).Password
npx playwright test -c playwright.hosted.config.ts
Remove-Item Env:STUORA_STAGING_ACCEPTANCE,Env:STUORA_TEST_STUDENT_A_EMAIL,Env:STUORA_TEST_STUDENT_B_EMAIL,Env:STUORA_TEST_STUDENT_A_PASSWORD,Env:STUORA_TEST_STUDENT_B_PASSWORD -ErrorAction SilentlyContinue
```

**Important:** A failed test should be treated as a blocker even if automated mocks pass. Playwright tracing, screenshots and video are explicitly disabled for this suite to avoid recording passwords. Check the terminal and staging data afterward. Never run it with production credentials or a production URL.

## Unresolved items
- Real email confirmation and recovery need separate, supervised qualification.
- Native iOS and Android devices need physical testing; bundle exports alone are insufficient.
- Housing photo upload, public decoding and UI owner-only removal are now included in this **unexecuted** two-student suite. Still separately test negative raw Storage API writes/reads, disallowed MIME/size inputs, image privacy after archival, and clean up any orphaned Storage objects.
- Moderator/report and account-block controls, accessible keyboard flows, and global errors still need real user checks.
- Billing and AI model inference remain off. Discounts/deals integrations are explicitly deferred.
