# Gen-3 staging checkpoint — 2026-10-23

Staging only: `uptjcspizukpjcoayhtn`. SQL applied unchanged from e8d5d7a. Production untouched.

| Source migration | Hosted version |
|---|---|
| `20261023010000_fair_listing_photo_admission.sql` | `20261023041536` |
| `20261023011000_moderation_and_suspensions.sql` | `20261023042833` |
| `20261023012000_conversation_closure_and_message_limits.sql` | `20261023042844` |
| `20261023013000_profile_discovery_consent.sql` | `20261023042909` |
| `20261023014000_realtime_private_messages.sql` | `20261023042915` |
| `20261023015000_ai_and_external_service_quotas.sql` | `20261023042952` |
| `20261023016000_personal_data_export.sql` | `20261023042958` |
| `20261023017000_conversation_safety_controls.sql` | `20261023043003` |

The moderation migration initially returned an expired connector request state. A history read confirmed it had not applied; a single retry succeeded. All eight entries were read back after completion.

Verified hosted grants: authenticated listing_media INSERT=false; profiles.is_discoverable UPDATE=false; reports.decision_reason SELECT=false; anon export_my_data EXECUTE=false; authenticated consume_ai_request EXECUTE=false. Media row/object counts remain zero. Realtime publication contains messages and student_group_messages. Storage policies retain avatar access and listing-media owner SELECT/DELETE only.

Remaining execution:
- All four Edge functions are now deployed (delete-account/external-data/stuora-assistant v1, listing-photo-intake v3). Configure STUORA_ALLOWED_WEB_ORIGINS for the exact tested preview. The connector exposes deployment but no secrets-management operation; browser access previously landed in a different organization. Do not embed configuration as a workaround or enable media/provider flags.
- Run real two-account acceptance with securely provided existing confirmed staging accounts and explicit test-write opt-in. Credentials are not available here; do not paste them into chat. Include the separately required owned listing fixtures for the direct media-denial runner.
- Verify successor CI and deployment SHA before using successor acceptance commands. The old e8d5d7a preview remains valid only for testing that exact commit.
- Native physical-device PKCE, SMTP delivery, legal/operator setup, moderation operations and production readiness remain unverified.

No claim of 100% readiness. Source tests and hosted schema readback are separate from real acceptance.
