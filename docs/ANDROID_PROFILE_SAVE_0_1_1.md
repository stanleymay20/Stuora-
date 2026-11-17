# Android preview 0.1.1: profile saving and layout

Based on Android preview branch `feature/android-development-build` at `2965f9b`.
Staging project: `uptjcspizukpjcoayhtn`. Production is not changed.

## Cause and change

The staging PostgreSQL logs at 18:11:55 and 18:12:13 UTC on 2026-11-17 rejected
the preview's profile PATCH with `42501` (permission denied). The request included
`is_discoverable`, while the authenticated role may update only display_name,
city and bio. Discovery changes intentionally use `set_profile_discovery(boolean)`
to record affirmative consent and enforce the suspension check.

Profile creation and updates now send only ordinary profile fields. After saving,
the app calls the existing consent RPC when the selected discovery setting differs
from the saved setting. Discovery defaults to OFF for a new profile. A consent
failure displays a partial-success message and reloads the saved profile so retry
updates the existing row. There are no new database grants, policies or RPCs.

## UI

- Safe-area context keeps the header and navigation within system insets.
- Savings is an inline Home card instead of a floating control over forms.
- Profile inputs have grouped labels, a narrower card and clearer privacy switch.
- Sign out is secondary to Save; notices distinguish success and errors.
- Keyboard dismissal and form tapping are supported by the profile scroll view.

## Validation

- TypeScript and browser profile/recovery/UI/discovery contract tests.
- Hosted staging transaction: own profile update and consent ON/OFF succeed;
  direct discovery and verification-field writes remain denied. All test changes
  are rolled back; no saved account or consent is modified by qualification.
- APK must be checked for staging configuration, package/version, ARM64 libraries,
  native callback intent filter, signature and ZIP alignment before delivery.
- Physical Galaxy A22 acceptance remains a user check; automated browser tests
  do not establish native runtime acceptance.

## Build

Use Node >=22.13, Java 21, Android SDK platform/build-tools 36, NDK 27.1.12297006
and CMake 3.22.1 with this lockfile. Configure the four staging public environment
variables described in ANDROID_BUILD.md. Run npm ci, Expo Android prebuild,
then Gradle assembleRelease with `-PreactNativeArchitectures=arm64-v8a`.
The generated Android directory is ignored; app.json is the source of configuration.

This remains an internally signed preview, not a Play Store release. The old APK's
internal signing key was not present in the workspace. A differently signed APK
with the same package requires removal of the old preview before installation.
Server-side account/profile data is retained, but device-local session data is lost.
Do not use the preview signing key for a production release.

The staging callback `stuora://auth-callback` was saved and verified in Supabase's
allow list. The recovery email uses `{{ .ConfirmationURL }}`. No password, GISMA
sign-in requirement or email template is changed by this release.
