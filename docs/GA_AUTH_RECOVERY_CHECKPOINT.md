# GA Auth recovery checkpoint

This slice starts from verified `main` at `fe56ac4e9d26cbd2827e378e96e99ebba274c620`, whose post-merge Stuora CI run passed dependency installation, Expo compatibility, database authorization, strict TypeScript, web export, desktop/mobile-web browser contracts, and iOS/Android bundle exports.

## Scope

The account surface now includes password recovery rather than leaving users permanently locked out. Signed-out users can request a password reset using only a valid email-shaped address. The success response is intentionally neutral and does not disclose whether the address is registered. Recovery links return to the same web application or to the `stuora://auth-callback` native deep-link scheme.

On web, Supabase Auth URL-session detection is enabled so confirmation and recovery callbacks can create the authenticated client session. On iOS/Android, the Auth provider consumes the initial linking URL and subsequent URL events, accepts only callbacks containing both access and refresh tokens, and marks recovery mode only when `type=recovery`. Normal email-confirmation callbacks establish a session without opening the password-change form.

A recovery session displays a dedicated password-change surface instead of the profile editor. New passwords require at least eight characters and exact confirmation. The client uses the documented `resetPasswordForEmail` and `updateUser({ password })` Auth operations; no privileged key is introduced.

## Verification boundary

Browser regression coverage exercises the reset request, privacy-safe success text, invalid email rejection, implicit web recovery callback, password validation, and the Auth user-update contract. Existing account/profile, listing, messaging, media, database authorization and native export gates remain unchanged.

This code does not claim production email delivery. Before commercial GA, the live Supabase project must have its actual web origin and native callback scheme permitted in Auth redirect configuration, and production-grade custom SMTP must be configured and successfully tested. Physical iOS and Android callback handling also requires device qualification.

## 2026-10-22 — Native callback routing hardening
- Authentication's native `Linking` handler previously inspected the fragment/query for tokens without requiring `stuora://auth-callback`. This could feed untrusted unrelated deep-link data into `supabase.auth.setSession`. The new pure `parseStuoraNativeAuthCallback` checks the actual registered scheme/host, forbids noncallback paths, userinfo, ports, overlapping query+hash, duplicate credentials/type, invalid bearer types and missing or whitespace tokens before delegating validation to Supabase Auth.
- Mandatory `tests/native-auth-callback.test.mjs` exercises legitimate signup/recovery links, foreign schemes/domains, misrouted Stuora URLs, duplicate/conflicting/oversize/malformed credentials and the source integration. These Node tests run without a phone, JWTs or network calls.
- IMPORTANT: routing validation does not prove issuer identity or bind deep links to an initiating device (login-CSRF/state). Stuora's existing native implicit token callback remains subject to a future PKCE/anti-replay threat-model review before commercial GA. Code-based `?code=` PKCE callbacks are intentionally **not** silently accepted by the existing implicit handler; future flow changes require coordinated Supabase Auth config and real iOS/Android QA. Hosted two-student callback acceptance, session expiry and email-delivery remain pending.
