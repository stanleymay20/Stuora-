# Stuora 0.1.5 internal candidate

Android package `com.stuora.app`, version code 6. The earlier 0.1.4 preview used a separate preview package. The basis for this candidate is the integration commit 8fc22f8311019377b548e46b62e3aa82f36ac18c. Keep the .aab, its SHA-256, the upload-certificate fingerprint, the EAS build ID and the Git commit together once signed. Check Play's existing package and highest code before uploading.

## Build

Use a clean checkout of the candidate commit, install the lockfile with `npm ci`, then run `npm run typecheck` and `node --test tests/*.test.mjs`. For an Android store bundle use `eas build --platform android --profile play-internal --non-interactive` with the linked Stuora EAS project and its approved remote upload key. Supply the staging publishable key and the verified preview origin in the preview environment. Never provision a replacement keystore during this step. Compare the signed bundle certificate with the approved upload certificate, use bundletool validate and inspect its manifest and permissions. Only after device and release checks, select Internal testing in Play Console.

## UK listing draft

**App name** Stuora

**Short description** Find student housing, browse listings and connect with other students.

**Full description** Find rooms and second-hand items in your city. Save listings, message other students and join groups around shared interests. Choose what to show on your profile and who can discover it. Use the reporting and blocking controls if you need help with another member. Core student features are free.

**Screenshots pending** Capture Home, an active listing and the group directory on the signed Android candidate with consenting staging fixtures. Exclude email addresses, private chats and identifiable profile photos. Earlier Passport screenshots contain personal information and belong to a different build.

## App content and Data safety working answers

| Area | Evidence from the candidate | Before declaration |
| --- | --- | --- |
| Access | Sign-in and account creation, email confirmation, restricted student flows | Supply a dedicated reviewer account and verify admission and recovery. |
| Age and user-generated content | Sign-up requires age 16+ and terms acceptance. Listings, groups and messages contain user-generated content. Report, block and moderation flows exist. | Operator confirms target audience, rating answers, moderation contact and procedures. |
| Personal information | Email and user ID are required for accounts. Profiles can contain display name, city and optional bio. Discovery is opt-in. | Confirm exact purposes and optional fields against the build. |
| Messages, app activity and photos | Private messages, group posts, listings, favourites, reports and blocks reach Supabase. Photo intake is gated on staging. | Distinguish collection from sharing and account for photos already stored. |
| External services | The internal profile enables external feeds. Provider requests may contain the selected city and search words. The optional AI and city lookup have separate switches. | Check actual build flags, provider use, contracts and retention. |
| Ads and payments | Core is free. No ad SDK or in-app billing dependency identified in the manifest. | Check final transitive SDKs, promotions and network behaviour. |
| Account deletion | In-app deletion and export are implemented. Reported content and suspension records have retention exceptions. | Verify deletion with disposable accounts, provide a working public deletion URL and privacy policy, and confirm retention and encryption answers. |
| Support | The legal page can open the configured operator mailbox when the operator configuration is complete. | Confirm the monitored support mailbox and verify the contact flow on the installed app. |

No declaration has been submitted. Capture support, privacy and deletion URLs as verified URLs before using them in Play.
