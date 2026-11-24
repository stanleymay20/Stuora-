# Stuora private group files — Phase 1 security checkpoint (2026-11-22)

## User goal
Students share and download PDFs, notes, pictures and documents **inside Stuora**. This does not mean downloading the Stuora app. The initial home is **Uni → Groups**; Life and private-message attachments are future integrations.

## Implemented in this branch (not deployed)
- New private Supabase Storage bucket `stuora-group-files`, capped at 5 MiB, restricting stored media to PDF or processed WebP.
- `public.student_group_files`: group-scoped metadata, filenames, trusted review state and timestamps. No anon access, no authenticated INSERT/UPDATE/DELETE privileges.
- Row-level SELECT: approved files appear only to CURRENT group members; pending files only to their uploader if still a member. No direct Storage object policies are added. Default is no direct client upload, listing, signing or download.
- Group deletion cascades metadata deletion and queues the opaque object path in `private.student_group_file_cleanup`. A worker must eventually delete those orphaned private objects; cleanup is not active yet.
- `group-file-download`: browser/native-compatible binary GET gateway implementation that validates a fresh user token, checks approved scan evidence, checks current group membership **and bans**, fetches privately as server service, checks content length, revalidates access and returns attachment bytes with no-store/nosniff and safe filename. No signed/public URL is returned.
- **Hard compile-time kill switch:** `GROUP_FILE_DOWNLOADS_COMPILED_IN=false`, plus staging-only URL and explicit activation env check. No deployed or functional download is claimed.
- PGlite database tests and Deno download-gate tests run in CI. Observe CI results and fix any failures before review.

## Missing before students can use the feature
1. A trusted authenticated UPLOAD intake, not direct client-to-Storage writes. Generate opaque group/file IDs on the server. Enforce active membership and bans at write boundary. Rate-limit/byte-limit *before* expensive decoding and capture committed durable admission records.
2. Image transformation via reviewed WASM processing (strip EXIF/GPS/metadata, bound dimensions and processing concurrency). Store clean WebP output and only then approve. Do not silently lift the separate listing-media write gate.
3. PDF malware scanning and controlled review. Merely checking %PDF or MIME is NOT adequate. PDFs stay `pending_review` until an actual scanner returns a reliable verdict; no bypass by a client-supplied status.
4. A cleanup worker for orphaned objects (remove pending/blocked/expired objects, delete group artifacts, retries) and an owner/member moderation/abuse path.
5. Mobile UX with trusted document/image picker and local save integration for iOS and Android, compatible with Expo SDK 57. Preserve filenames, support a progress indicator, failures, retries and permissions; do not add new unpinned dependencies without updating the lockfile. Download must be performed using the signed-in user's Authorization header, not an unscoped URL.
6. Two distinct real staging student accounts to confirm (a) upload and scan, (b) authorised download, (c) outsider/banned/removed members cannot see metadata or bytes, (d) duplicate/replay/rate limits, (e) logout and expired-token failures.
7. Legal/copyright and GDPR notice, content moderation, file-size/retention policies and real iPhone/Android acceptance.

## Release and deployment boundary
The existing Apple TestFlight branch `release/ios-testflight-0.1.6` and production Supabase project `mljmifovcthvtuquvyzf` must remain unchanged.

The ONLY target for a future controlled backend test is staging `uptjcspizukpjcoayhtn`, after review, and this stage should not be applied until the complete migration+gateway+cleanup plan is approved. No uploaded student files, credentials, API service keys or personal data belong in GitHub.

New structures must not be interpreted as a live user feature. A link to a file is not itself authorization; fresh membership and approval are required for every request. The gateway has no public or signed URL issuance to avoid stale access after member removal.

## Operator acceptance checklist
- [ ] All exact-head CI jobs green
- [ ] Storage and metadata RLS advisors checked against staging
- [ ] Trusted upload and PDF/image processing implemented
- [ ] Real member/nonmember/removed/banned JWT tests, plus security rules on Storage
- [ ] Two-student staging end-to-end acceptance
- [ ] Native iPhone save and Android download tested
- [ ] Private-object deletion verified
- [ ] Written approval to activate the compile-time release lock and staging env
