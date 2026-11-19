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

Play app 4972345199985000037 has an Internal testing draft. Browser file chooser upload timed out and reset the browser session. Reopened the draft and verified that no bundle was present. No rollout or tester link exists. Upload remains pending.

Other acceptance remains open: server-enforced student admission and student number mapping, fresh email recovery on Android/web, authenticated real provider navigation, permitted Jobs and Trips source qualification, photo enablement, two-student acceptance, support delivery and accurate final Play declarations.
