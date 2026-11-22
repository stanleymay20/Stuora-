# Stuora Uni → Groups: staging security checkpoint — 22 November 2026

**Environment:** dedicated Supabase staging project `uptjcspizukpjcoayhtn` (`stuora-staging`, `eu-central-1`). This report records verified operations performed through the connected Supabase account, not proposed actions. The original iOS TestFlight branch `release/ios-testflight-0.1.6` and production project `mljmifovcthvtuquvyzf` were not modified.

## Stage 1 — Database migrations APPLIED successfully to staging

The migrations below are now installed in the dedicated **staging** database and recorded in Supabase migration history. They were applied from GitHub branch `feature/clamav-staging-readiness-20261122` with `apply_migration` and each returned `success: true`.

| Recorded migration version | Staging migration name | Role |
| --- | --- | --- |
| `20261122213532` | `student_group_file_quarantine_20261122` | Private bucket and RLS metadata |
| `20261122213604` | `student_group_file_intake_rpc_20261122` | Privileged admission and atomic commit |
| `20261122213607` | `student_group_file_ban_visibility_20261122` | Banned-member metadata denial |
| `20261122213609` | `student_group_file_cleanup_leases_20261122` | Private lease-based object cleanup |
| `20261122213612` | `student_group_file_delete_rpc_20261122` | Owner/uploader removal |
| `20261122213615` | `student_group_pdf_scan_jobs_20261122` | Private PDF quarantine and scan queue |

**Important:** GitHub migration source filenames remain `20261122190000_...` etc.; Supabase recorded its own migration versions/names when these operations were applied. When reconciling database changes in a future deployment, **do not blindly replay these six files** against staging or create duplicate DDL. Compare migration history and schema before any subsequent deployment.

## Stage 2 — Live security observations (read-only verified)

- `public.student_group_files` exists with **zero** rows; `private.student_group_pdf_scan_jobs` and `private.student_group_file_cleanup` also each have **zero** rows.
- `storage.buckets.id = 'stuora-group-files'` exists, is `public=false`, and has a **5,242,880-byte** limit.
- `public.student_groups` currently has **zero groups**. End-to-end two-student authorisation cannot yet be claimed.
- The new file-metadata table has an authenticated **SELECT** RLS policy, but `anon` has no SELECT privilege and `authenticated` has no direct INSERT, UPDATE or DELETE privilege.
- `authenticated` has no SELECT privilege on the private PDF scan queue.
- All private scan/cleanup/admission/commit functions are callable by `service_role` but **not** by `anon` or `authenticated`. Two explicit user-facing functions—`can_read_student_group_files` and `delete_student_group_file`—are intentionally callable only by authenticated accounts and use their current `auth.uid()`.
- All currently defined `storage.objects` policies target the existing `avatars` or `listing-media` buckets; none targets `stuora-group-files`. This private bucket is not available for direct student upload, listing or download.

## Stage 3 — Scanner and deployment status

- Isolated GitHub Actions test **45065309434** passed against a *genuine ClamAV daemon*: clean benign PDF and the standard harmless EICAR test pattern.
- Draft PR #36 (hash-bound scan jobs/approval) and #37 (self-hosted ClamAV bridge) passed full app CI as of this checkpoint.
- The branch `feature/clamav-staging-readiness-20261122` adds a non-root Node scanner Dockerfile, a private Compose template (no published ports), and a separate real-ClamAV CI workflow; the actual ClamAV **service is not deployed anywhere**.
- **Staging-only disabled canary deployed:** `group-file-download` Edge Function version 1 exists in staging, with `verify_jwt=true`; its deployed source was independently fetched and confirms `GROUP_FILE_DOWNLOADS_COMPILED_IN = false`. This creates an authenticated endpoint but cannot return file bytes while the compile-time lock is off.
- `group-file-intake`, `group-file-cleanup`, and `group-file-pdf-scan` Edge Functions are **not deployed**. No cron worker or live scanner was scheduled or hosted. No public activation of file-sharing features took place.
- Source code retains `GROUP_FILE_UPLOADS_COMPILED_IN=false`, `GROUP_FILE_DOWNLOADS_COMPILED_IN=false` and `GROUP_PDF_SCANNER_COMPILED_IN=false`. No student can use the new group-file feature yet.

## Advisors and explicitly accepted/unfinished review

Current staging security advisors reported:
- `authenticated_security_definer_function_executable` warnings for `can_read_student_group_files` and `delete_student_group_file`. These functions are intentionally authenticated and scope actions to current-user identity or file/group ownership, but require independent security review and real-user tests before release. See [Supabase privileged function lint](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).
- `rls_enabled_no_policy` informational notices for private queues, intentionally restricted from client access. Check that schema and function grants stay restricted. See [RLS lint](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy).
- An existing `auth_leaked_password_protection` warning. Consider enabling leaked-password protection after reviewing the correct Auth setting. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
- Indexes on empty tables are reported as unused, which is not evidence they should be dropped.

## Hard release gates — NOT yet met

- [ ] Review actual Docker image versions/digests, confidential scanner tokens, network/TLS setup and FreshClam update monitoring; host real scanner only in an approved region.
- [ ] Verify scanner is ready and returns true clean/malicious/outage verdicts with EICAR and a benign PDF through its authenticated HTTPS bridge, not merely a mocked response.
- [x] Deploy and inspect **disabled** `group-file-download` gateway in staging, with JWT verification and hard source lock OFF. (An actual HTTP request with a real student JWT has **not** yet been verified.)
- [ ] Deploy/verify the **remaining disabled** group-file intake, cleanup and PDF scanner Edge Functions in staging after independent Auth/secret-key checks. Never enable staging/public clients without full security signoff.
- [ ] Prepare **two legitimate staging student accounts** and a staging test group. Test nonmember, member, banned, removed and rejoined cases with real JWTs, not only SQL simulations.
- [ ] Exercise image intake, quarantined PDF, scan approval/denial, owner removal, orphan cleanup and expiry; ensure no stale links and no unreviewed bytes.
- [ ] Test iPhone Files and Android folder export on actual devices; refresh app UX/accessibility.
- [ ] Review copyright policy, abuse reporting, GDPR processing basis, storage retention and deletion handling.
- [ ] Review staging security advisors and confirm no new dangerous grants.
- [ ] Explicit release approval before changing any hardcoded OFF switches, deploying to production, or altering TestFlight.

### Useful CI and review links

- Real ClamAV smoke run: https://github.com/stanleymay20/Stuora-/actions/runs/45065309434
- PR #34 storage/download: https://github.com/stanleymay20/Stuora-/pull/34
- PR #35 upload/cleanup: https://github.com/stanleymay20/Stuora-/pull/35
- PR #36 scanned PDFs: https://github.com/stanleymay20/Stuora-/pull/36
- PR #37 self-hosted scanner: https://github.com/stanleymay20/Stuora-/pull/37

This checkpoint is an operations **evidence record**, not permission to release student uploads.
