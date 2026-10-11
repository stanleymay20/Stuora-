# GA checkpoint — secure listing messaging

Base: `72bdb7e99431e0d347c81008dce4fbcfee848362`.

This slice closes the first commercial transaction-loop blocker without adding a parallel chat system.

## Runtime behavior

- Housing and Marketplace remain the only client-publishable listing kinds.
- An authenticated student with a completed profile can start or reopen exactly one conversation for an active Housing or Marketplace listing they do not own.
- Conversation creation and both memberships are atomic and server-controlled.
- Arbitrary client conversation/member inserts are revoked.
- Conversation/message RLS remains the visibility and send boundary.
- Messages must contain 1–4,000 non-whitespace characters.
- The Messages tab now reads real persisted conversations and messages; no seeded conversations are shipped.
- Failed/stalled reads expose retry paths and never substitute sample data.
- Realtime is intentionally not enabled in this slice; Refresh is deterministic.

## Security

The privileged conversation bootstrap implementation lives in the private schema. The public RPC is SECURITY INVOKER and requires an authenticated caller. The private implementation validates `auth.uid()`, profile existence, listing status/kind, ownership, and membership before writes. Supabase security advisor returned zero findings after the final migration.

## Still required for commercial GA

- exact-head CI for this PR;
- real two-account hosted acceptance with email confirmation;
- Storage-backed profile/listing media with RLS and lifecycle tests;
- native physical-device qualification;
- Trips atomic participation flow;
- employer-controlled Job publishing and applications;
- report/block/moderation enforcement;
- production/staging environment isolation and release/rollback runbook.
