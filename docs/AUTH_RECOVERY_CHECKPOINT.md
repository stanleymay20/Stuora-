# Auth recovery commercial-GA checkpoint

This slice adds a deterministic password-recovery path without weakening the existing Supabase Auth + RLS model.

## Implemented

- Web reset requests redirect back to the current Stuora origin with `?recovery=1`.
- Native reset requests use the app scheme `stuora://auth/recovery`.
- Native email confirmation returns use `stuora://auth/callback`.
- `AuthProvider` handles web URL fragments and native deep-link events explicitly because the cross-platform client keeps `detectSessionInUrl: false`.
- Access and refresh tokens from an auth link are passed to `supabase.auth.setSession`; token fragments are removed from the visible web URL immediately after a successful handoff.
- Recovery links route to a dedicated account screen instead of requiring the user to find the profile tab.
- Forgot-password responses are deliberately generic: the UI does not reveal whether an email address has an account.
- New passwords require at least eight characters and matching confirmation input.
- Successful password update signs out the temporary recovery session before presenting the completion state.
- A recovery marker without a valid session cannot enable password update.

## Automated contract

Desktop and mobile-web browser tests cover reset-email request parameters, privacy-preserving copy, recovery-link token handoff, URL token removal, mismatched password validation, password update, recovery-session sign-out and expired/missing-session behavior. The existing native export gate verifies the deep-link code compiles for iOS and Android.

## External release qualification still required

The code alone cannot configure hosted Supabase Auth redirect policy. Before commercial release, the Supabase Auth URL configuration must explicitly allow the production web origin and the native Stuora scheme used by this build. Real email delivery must then be tested end-to-end with a genuine mailbox on the deployed production origin and on physical iOS and Android devices.

Universal/App Links are preferable for the final branded mobile release because they provide stronger domain ownership and user experience than a custom scheme. The custom `stuora://` route is an explicit controlled first implementation, not a claim that universal links are already configured.

This checkpoint does not declare commercial GA. It is one release gate within the wider GA program covering two-account operation, environment isolation, observability, moderation, legal/privacy, backup/restore and native-device qualification.
