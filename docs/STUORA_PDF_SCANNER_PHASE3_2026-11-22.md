# Stuora Uni → Groups — real PDF inspection boundary (Phase 3)

## Status, 22 November 2026

**Source implementation only. The PDF worker is compiled OFF.** No new Supabase migrations or Edge Functions have been applied/deployed; no student PDFs have been sent to a scanner. Existing TestFlight and production environments are unchanged.

This phase addresses a previously explicit release blocker: merely recognizing `%PDF` and `%%EOF` is **not** malware scanning. PDF documents must remain **pending_review** until a **real external, approved scanner** has inspected their *exact bytes*. Images still use the existing trusted WebP transcoding route.

## Implemented

1. Migration `20261122230000_student_group_pdf_scan_jobs.sql` creates a private queue on insertion of a pending PDF, with **service-only RPCs** for claiming and finalizing jobs, a three-minute lease, maximum 2 scans/batch, six bounded attempts, and dead-letter investigation after exhaustion.
2. A PDF can transition from pending to approved **only** through the service-role finalization path, after a lease, verdict `clean`, engine `clamav-http-v1`, and a syntactically valid SHA-256. A scanner finding malware sets `blocked`; a scanner outage leaves the PDF pending with exponential backoff.
3. `group-file-pdf-scan` Edge worker is disabled via `GROUP_PDF_SCANNER_COMPILED_IN=false`, requires an independent strong worker token and a server secret, and can only run against the **staging** Supabase project. The operator must supply approved HTTPS scanner endpoint, pinned hostname, and scanner API token through server-side secrets.
4. Before a clean verdict can be submitted, the worker fetches the private Storage object, checks size and PDF preflight, computes SHA-256, sends the bytes to its *operator-configured* HTTPS scanner, requires an exact matching hash and the approved engine identifier, then downloads and hashes the bytes a second time to catch replacement.
5. The download gateway now requires PDF scan engine/hash metadata and independently hashes **every approved PDF download**, refusing a changed object. It continues to recheck current membership and bans. Photo WebP files still require the trusted-image-transcode method.
6. Tests cover scanner endpoint validation, server-only execute grants, false verdicts, mismatched hashes, unverified engines, scanner outages, job lease replay, changed Storage bytes, dangerous paths, retries, and blocked documents.

## Required scanner contract (not supplied or connected)

A separately operated and reviewed HTTPS service must expose `POST /v1/scan-pdf` and implement **actual PDF malware scanning** with ClamAV or an explicitly evaluated equivalent. It must authenticate a dedicated bearer token, accept `Content-Type: application/pdf`, and receive a `X-Stuora-Content-SHA256` digest. It must answer JSON:

```json
{"verdict":"clean","sha256":"<64 lowercase hex digits>","engine":"clamav-http-v1"}
```

For malware, verdict is `malicious`. For error/uncertainty it should return an error status; *never* claim clean if scanning was incomplete, timed out, or engine signatures are unavailable. The scanner must compute its own hash of the bytes it received; merely echoing the header is not proof of scan. This repo does not host a scanner or a processing contract, and it **must not be enabled with a mock scanner**.

PDF files may contain active content even after a successful malware scan. Downloads must retain `application/octet-stream` and `Content-Disposition: attachment`, not inline HTML/PDF previews. Consider CDR/sandboxing and user guidance before general release. A clean antivirus verdict is not a guarantee of safety.

## Deployment and privacy release gates

- [ ] Choose and assess a real scanner service, secure network, supported ClamAV signatures, update monitoring, privacy/data-processing agreement, EU/EEA data transfer basis and retention/deletion policy; **no third-party uploads before approval**.
- [ ] Rotate and store service keys, worker token, scanner token and host configuration as project secrets; do not commit secrets to GitHub.
- [ ] Review current Supabase Edge auth guidance: when invoking from scheduler using secret key, use current secret-auth conventions and function-level JWT verification settings; do not expose worker endpoints to student clients.
- [ ] Confirm migration indexes, constraints, RLS and DB advisor output in isolated staging, then deploy compiled-off workers to staging only if approved.
- [ ] Test real scanner with a safe test PDF and EICAR **test fixture** in a controlled environment; avoid collecting any real student's files during validation. Confirm that scanner errors never approve PDFs.
- [ ] Validate two real student accounts: member, nonmember, removed and banned; immediate metadata access revocation; no stale URLs.
- [ ] Qualify actual iPhone/Android file picker and save behaviour plus failed cleanup and group removal.
- [ ] Configure operator alerts for six exhausted scan attempts, eight exhausted file-cleanup attempts, and permanent Storage orphan failures.
- [ ] Explicitly approve the activation flags only after staging acceptance and legal review.

The updated scanner and earlier private upload/download feature remain isolated on draft review branches. No public release is authorised by this document.
