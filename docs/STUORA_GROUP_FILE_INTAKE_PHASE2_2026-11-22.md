# Stuora Uni → Groups: file upload intake (Phase 2, 2026-11-22)

## What exists on this draft branch

1. Private group file metadata and a private Storage bucket from Phase 1 remain inaccessible to anonymous users, nonmembers and former members. Download gateway verifies membership and approval for every request; no signed/public links.
2. `public.claim_student_group_file_upload`: service-role-only committed admission, checks student account, live membership and bans, and limits each student to 12 attempts per hour.
3. `public.commit_student_group_file_upload`: server-only atomic metadata commit rechecks active student profile, group membership and ban state under row locks. Caps files to 20 per uploader/group per rolling 24 hours. Refuses unverifiable paths, statuses, formats or names.
4. `group-file-intake` Deno Edge Function: JWT verified with Supabase Auth; staging-only and **compile-time OFF**. Caps multipart request size (5 MiB + envelope) and network read time (15 seconds) before decoding. Object paths are opaque group UUID/file UUID, never account IDs.
5. Images are preflighted/decoded with Stuora's existing trusted ImageMagick WASM pipeline and converted to clean WebP, stripping metadata. A durable global processing lease (shared with listing photo processor) caps decoder concurrency. WebP metadata becomes `approved` only after trusted output was stored and the second membership check passed.
6. PDFs are recognized only for format plausibility and stored **pending_review** in the private bucket. A header/EOF check is NOT antivirus scanning, so there is no path to approval/download without a future real scanner and operator controls.
7. Failed metadata commit triggers best-effort orphan object deletion; permanent cleanup worker is still required. No direct user Storage INSERT, UPDATE or SELECT grant is added.
8. Group photo picker is wired on web/iOS/Android using existing `expo-image-picker`, but has a **second disabled feature flag**. `EXPO_PUBLIC_STUORA_GROUP_FILES=enabled` enables only listing/download UI in staging; `EXPO_PUBLIC_STUORA_GROUP_UPLOADS=enabled` additionally controls the photo picker. Neither flag can override the Edge compile-time OFF lock.
9. PGlite tests cover revoked membership, bans, service-only writes, 12/hour admission, quarantined PDFs and document path checks. Deno tests cover names and PDF preflight, plus existing trusted-codec tests. Client tests guard that JWTs never appear in attachment URLs.

## Still required

- A trusted PDF antivirus/inspection service and audit workflow; metadata approval only after scan result. Do not send private student documents to a third-party scanner without a legal/processor assessment.
- PDF/document picker UI and download-to-Files acceptance on physical iPhone; Android export/share-sheet support.
- Media moderation/reporting, successful object cleanup worker with bounded retries, GDPR/copyright notice, retention and data subject deletion.
- Staging-only migrations/Edge deployment and real two-student JWT tests (member, outsider, banned, removed and file status changes) before enabling either feature.
- Full exact-head CI, screenshot accessibility review, security-advisor review and explicit release authorisation.

## Important release rules

This is a stacked **draft** against `feature/private-group-files-phase1-20261122`, not the current iOS TestFlight release branch `release/ios-testflight-0.1.6`. Nothing was applied to the staging Supabase database or published to the production app. All compile-time switches remain false. A SQL migration present in source code does not mean it has been deployed.

No students can currently upload/download files from this branch in a production app; live capabilities must not be advertised until these gates pass.
