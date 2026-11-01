# Stuora Android build qualification

## Current state
Expo/React Native already targets Android. Native bundle export is checked in CI, but a bundle export is not an installed APK or runtime acceptance test.

## Backend isolation (mandatory)
Do not point an internal APK at production. Provision a separate hosted Supabase staging project and apply the reviewed migrations before issuing APKs. EAS environment named `preview` must provide:
- `EXPO_PUBLIC_STUORA_ENV=staging`
- `EXPO_PUBLIC_SUPABASE_URL=https://<staging-project>.supabase.co`
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<staging publishable key>`
- `EXPO_PUBLIC_STUORA_WEB_ORIGIN=https://<approved-staging-web-origin>`

The app's existing backend validator must pass. The origin must match an approved HTTPS staging origin. Do not use the controlled production project `mljmifovcthvtuquvyzf` for staging. Never put service_role or sb_secret keys into EXPO_PUBLIC variables. EAS environment selection does not by itself establish isolation; verify the resulting bundle and staging project.

## First internal APK
1. Install Node >=22.13, run `npm ci`, `npm run typecheck`, `npm run test:database`, `npm run check:environment` with the intended staging variables.
2. Authenticate to the correct Expo account with `npx eas-cli login`; run `npx eas-cli init` to link the project (review generated app config before committing).
3. Set EAS `preview` environment variables to staging values, and verify access without printing the publishable key.
4. Run `npx eas-cli build --platform android --profile preview`. This generates an internal APK if cloud credentials and build succeed.
5. Install on a physical Android device; capture Android version, build ID, and pass/fail evidence.

## Device acceptance
- Cold launch, foreground/background resume, and session persistence.
- Signup/confirmation email, password login, logout and re-login.
- Profile edits and privacy visibility with two staging accounts.
- Housing and marketplace create/edit/archive and owner isolation.
- Search, pagination, refresh and offline/error retry.
- Photo permission prompt and back navigation; don't claim uploads work before implementation.
- Demo-only modules must remain clearly labeled.
- No production project requests from the preview build.

## Production gate
Only after native device acceptance and release/security review: configure the EAS `production` environment with the controlled production URL, approved HTTPS origin and publishable key, then build an AAB with `npx eas-cli build --platform android --profile production`. Confirm signing, versionCode, privacy/data-safety disclosures, support and Play testing requirements. Do not submit or merge automatically.
