# Stuora iOS 0.1.6 — TestFlight continuation checkpoint (2026-11-22)

## Verified source / scope

- Repository: `stanleymay20/Stuora-`.
- Release branch: `release/ios-testflight-0.1.6`.
- Pre-workflow release commit: `ee836945a1068a2b99cf0aae51a70f9c713f94bf`.
- GitHub Actions at that commit: Stuora CI #45023262156 SUCCESS in all four jobs; iPhone Simulator #45023262359 SUCCESS, including `expo prebuild`, CocoaPods install, Release compilation **without code signing**, simulator install, app launch, and auth-callback deep-link opening.
- Simulator success proves build and launch in a test environment, **not** a signed IPA, TestFlight upload, real-user authentication, Apple signing validity, or live device quality.
- Expo config in `app.json`: owner `stuora`, slug `stuora`, app version `0.1.6`, bundle ID `com.stuora.app`, build number `1`, EAS project ID `1ab07441-9b46-45a3-a5f6-2e33ea5bcf30`.
- `eas.json` `testflight` build profile uses remote iOS signing credentials and inherits `distribution: store` and `environment: preview` from `play-internal`. The environment is explicitly set to Stuora staging at `https://uptjcspizukpjcoayhtn.supabase.co`.
- Source has device-bound Supabase PKCE flow, strict `stuora://auth-callback` parser and native tests. CI passes, but real email delivery and physical-device callbacks are not verified.

## Newly prepared manual workflow

`.eas/workflows/ios-testflight.yml` contains a **manual-only** Expo Workflow with two sequential jobs: build iOS using profile `testflight`, then upload the resulting signed build to Apple TestFlight. There are **no push triggers**, so no new paid build, upload, or public release occurs from ordinary commits. This file is configuration only until an authorized operator starts it.

## Remaining external prerequisites (not verified from GitHub)

1. Access to the Expo organization `stuora` and an Expo user/robot authorized to run EAS.
2. A paid active Apple Developer membership with proper signing rights; certificate, `com.stuora.app` identifier, and App Store provisioning profile must be present in Expo's remote credential store, or created interactively by an authorized Apple account owner.
3. Apple App Store Connect app record and suitable API key assigned to Expo for noninteractive TestFlight upload. If noninteractive submission uses a submit profile, its `ascAppId` must be known/configured. Do **not** guess an Apple team or app ID.
4. Confirm `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` and any other necessary nonsecret public client variables are present in the Expo `preview` environment, matching **staging**. Do not substitute production. Never place Apple passwords, access tokens, or .p8 keys in GitHub code/chat.
5. Confirm Expo Workflows is enabled/connected for the project as needed. Confirm a build quota/cost is acceptable before triggering remote work.

## Safe operator sequence

- Use a trusted authenticated Expo session to check project access and the `testflight` iOS signing credentials (`eas credentials --platform ios`). Initial signing setup may require an interactive Apple login; an unattended GitHub run cannot create missing Apple credentials.
- Confirm an App Store Connect record / API key and staging environment variables before running any signed build.
- From the approved release branch, manually run the Expo workflow: `eas workflow:run ios-testflight.yml`. If Expo requires an explicit Git reference, select `release/ios-testflight-0.1.6` and its reviewed exact commit. Do not accidentally build `main`.
- Capture the Expo workflow URL, EAS Build ID / IPA signing status, EAS Submit status, and App Store Connect TestFlight build number. Until confirmed, state **TestFlight not verified**.
- Internal TestFlight is not an App Store public launch. Do not invite external testers or release to the App Store automatically.

## Physical iPhone acceptance checklist before any broader beta

- Install from Apple TestFlight; launch from a clean install and reopen after termination.
- Sign up using a dedicated confirmed *staging* student account; verify the confirmation email arrives and callback opens Stuora.
- Test password sign-in, native PKCE recovery from the same requesting iPhone, invalid/expired callback rejection, logout and session restoration.
- Create/edit profile, verify correct privacy defaults, and verify student-only access restrictions.
- Run two distinct staging accounts end-to-end for listings, discovery, messaging, cross-account isolation, and any enabled photo upload path; do not enable disabled photo features or seed real data without approval.
- Test device/network interruptions, permissions and graceful empty/error states. Keep the commercial GA gate off until supported.

## Known unrelated blockers

Mainline or earlier draft PRs include unmerged or gated features. Do not merge unrelated feature PRs or change production Supabase, payment flows, RLS policy, or external integrations as part of this TestFlight build. Follow `docs/GA_RELEASE_GATE.md` for release requirements.

**Classification:** iOS 0.1.6 source is simulator/CI verified; signed TestFlight and physical-device acceptance remain **UNVERIFIED**.
