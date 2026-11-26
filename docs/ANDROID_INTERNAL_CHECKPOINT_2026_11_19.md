# Android Internal testing checkpoint, 19 November 2026

Signed build 0.1.5 (6), package com.stuora.app, source e4b91aae8281f1078fd90a2ec38f8518725317d0.
EAS build cd7d094c-9e4a-43f3-955e-712051f4b294 completed and produced an AAB.
https://expo.dev/accounts/stuora/projects/stuora/builds/cd7d094c-9e4a-43f3-955e-712051f4b294

AAB SHA-256 f5007616cc23fe3cc8ccd8623ecc5d405136197c3d9fe787d8611b355b7da10e.
Upload certificate SHA-256 88:FC:AF:3F:B9:47:18:71:A3:77:22:66:54:6F:4C:BA:81:F2:F7:41:FC:50:FE:9E:CD:78:4A:AD:41:9E:14:71.
OpenSSL verified the detached CMS signature and signed manifest, followed by all 1,220 signed ZIP entry SHA-256 digests.
Full bundletool validation and installed-device acceptance are pending.

Expo organisation stuora, project 1ab07441-9b46-45a3-a5f6-2e33ea5bcf30.
Remote Android keystore created with owner approval. Preview environment has the staging publishable key and exact preview origin.
Do not commit private signing credentials.

Later source changes on this branch include the fresh-cache external feed test build, Expo SDK patch updates, and staging-only additional origin configuration. The AAB above predates those client dependency updates and must be distinguished from a subsequent build.

CI c0e9f4f passed 180 standard browser cases and both external-feed browser cases, skipped six cases, and exported native bundles. Its final SDK compatibility check failed and led to the Expo patch update. Dependency audit remains failing. Post-update local TypeScript passed and all 111 Node tests passed. These are automated results. No new real-device acceptance or signed-in Ticketmaster inventory acceptance was performed.

Staging external-data function version 16 is ACTIVE with JWT verification enabled. Its source matched the repository before the additional origin setting was applied. STUORA_STAGING_WEB_ORIGIN supplements the existing origins only on project uptjcspizukpjcoayhtn.
Verified exact origin https://stuora-preview-j31ncq0vb-stanleymay20s-projects.vercel.app returns OPTIONS 204 with matching allow-origin header.
Unrelated HTTPS origin returns 403. Native preflight returns 204. Anonymous POST returns 401.
Existing origin entries were preserved.

Play app 4972345199985000037 has release 0.1.5 (6) active on Internal testing. On 19 November the owner tester list was saved, selected for Stuora, and the release rolled out with user approval. The invitation opened for the approved owner account at https://play.google.com/apps/internaltest/4701573468721508581. The Galaxy A22 subsequently showed confirmed GISMA email and a successfully saved profile. Staging readback confirmed email confirmation, Berlin and enabled discovery. Recovery and multi-student flows remain unqualified.

## 20 November remediation candidate

Prepared 0.1.6 (7) from the existing Internal release branch, integrating reviewed commit 42c31c6 from claude/release-ci-hardening. The new source clears Metro on every export, pins CI actions, tightens the dependency baseline to three moderate package nodes, and adds participant/avatar privacy fixes. It preserves the newer Expo patch versions already on the release branch.

Validated npm ci, TypeScript, 113 Node tests, live dependency audit (3 moderate, 0 high/critical), Expo compatibility and web export. Local browser verification passed after installing Chromium: 180 passed, 6 skipped, plus 2 external-feed cases passed with the feature flag enabled. Android and iOS JavaScript exports passed. CI exposed a duplicated --clear argument after integration, corrected in the workflow. Signed AAB build d3f8dc8c-2d78-48f7-84f2-9d56f71c1eb5 succeeded from source 5f4f38f147f979456a293459170caa61a4e83e09. CI-only correction a433bbf19be15396e8e0afb4b4801c5daeafcfdc passed all four GitHub jobs in run 44793828536. On 21 November Play accepted 0.1.6 (7), and the Internal track rollout was verified Active / Available to internal testers. Existing owner tester list applies. AAB SHA256 41a4af42c2336b6991f53e79593f6e914e72b642358ceed445c16f4fb5660913. Upload certificate SHA256 matches the prior release, 88:FC:AF:3F:B9:47:18:71:A3:77:22:66:54:6F:4C:BA:81:F2:F7:41:FC:50:FE:9E:CD:78:4A:AD:41:9E:14:71. OpenSSL CMS verification passed and all 1220 manifest entry digests matched. Device acceptance remains pending. Staging contains one confirmed GISMA account, so live two-student testing remains blocked on participation.

Applied participant_privacy_and_private_avatars to staging only. Readback confirms avatars.public=false and trip_participants_read_self_or_owner checks the current user or trip owner. Database authorization tests pass locally.

Other acceptance remains open: server-enforced student admission and student number mapping, fresh email recovery on Android/web, authenticated real provider navigation, permitted Jobs and Trips source qualification, photo enablement, two-student acceptance, support delivery and accurate final Play declarations.
