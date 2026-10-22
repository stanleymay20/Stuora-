# Stuora-branded Auth emails: controlled staging pack

**Source-only: NOT installed in the hosted authentication service.**

Six email authentication flows and seven optional account-security notification templates are versioned here with subjects in `subjects.json`. Do not equate branded source templates with installed SMTP sender branding.

## Staging-first rollout
1. Back up current hosted Auth templates, SMTP settings and redirect allowlist.
2. In [Stuora staging Email Templates](https://supabase.com/dashboard/project/uptjcspizukpjcoayhtn/auth/templates), use the corresponding HTML and subject for each supported template. Preserve `{{ .ConfirmationURL }}`, `{{ .Token }}` and other documented Go-template variables.
3. Under [Staging Authentication settings](https://supabase.com/dashboard/project/uptjcspizukpjcoayhtn/settings/auth), configure a verified Stuora-owned From mailbox and **Stuora** display name with custom SMTP. Authenticate SPF, DKIM and DMARC. Never commit or share SMTP credentials or invent a sender address.
4. In [Staging Auth URL settings](https://supabase.com/dashboard/project/uptjcspizukpjcoayhtn/auth/url-configuration), explicitly allow the actual approved Stuora HTTPS app URL and, after device qualification, `stuora://auth-callback`. Do not allow wildcard preview origins.
5. With controlled staging inboxes/accounts, validate signup confirmation, password reset, change-email and invited user flows; verify sender identity, button links, expiry, error handling, email client rendering, and mobile callbacks. Enable the optional security notifications only after service support and security review.
6. Only then plan a separate production rollout. No change to production, Storage RLS, student data or the trusted-media release lock is part of this brand pack.

**Limits:** Branded HTML/SMTP does not automatically remove `supabase.co` from the verification link returned by `{{ .ConfirmationURL }}`. A separate custom Auth domain may be needed and is subject to plan/DNS verification. The current templates deliberately avoid remote images, invented support contacts and external links.

Guidance: https://supabase.com/docs/guides/auth/auth-email-templates and https://supabase.com/docs/guides/auth/auth-smtp

## Staging-only management API rollout tool
`node scripts/stuora-auth-branding.mjs --plan` validates all six core Stuora templates and prints the exact field names and a SHA256, **without network access**. The optional `--include-security-notifications` adds seven notification template pairs without enabling sending. `--apply-staging` requires `STUORA_AUTH_BRANDING_APPROVAL=STAGING_ONLY_APPROVED` and `SUPABASE_ACCESS_TOKEN` from the authorized operator's own secure environment. Never share tokens in chat, logs or GitHub.

On explicit execution it targets **only** staging `uptjcspizukpjcoayhtn`, saves *only* affected previous templates/subjects in a mode-0600 local temporary backup, PATCHes only those fields, then verifies exact readback. It does not configure SMTP/sender, enable notifications, change Auth redirects, activate any Edge function or touch production. Staging email delivery and account acceptance remain mandatory after a successful template readback. Official API documentation: https://supabase.com/docs/guides/auth/auth-email-templates .
