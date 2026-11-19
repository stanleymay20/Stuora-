# GA safety hardening checkpoint

Migration: `supabase/migrations/20261119013000_ga_safety_hardening.sql`. Apply it to a local or staging project first, then production, through the normal migration workflow. It is not yet applied to the hosted project.

## Closed findings

| Finding | Fix | Evidence |
| --- | --- | --- |
| Clients could set `created_at`/`updated_at` on insert and pin a listing to the top of the feed | Listing insert is limited to content columns; a trigger stamps both timestamps | `tests/database.test.mjs` |
| Housing/Marketplace listings could be created without a details row | Deferred constraint trigger checks details at commit; owners can no longer delete details rows directly | `tests/database.test.mjs` |
| `listings.price_cents` and `housing_details.rent_cents` could disagree | Listing price is the single source of truth; triggers keep rent in sync | `tests/database.test.mjs` |
| A listing owner who left a conversation was re-added by the other party | `start_listing_conversation` re-adds only the caller on an existing thread | `tests/database.test.mjs` |
| No blocking | `user_blocks` table (private to the blocker); a block stops messages in both directions and new listing conversations; Block/Unblock in Messages | database + `tests/web/messaging.spec.ts` |
| Messages could not be reported | `reports.conversation_id` (members only); Report with reason in Messages | database + browser tests |
| No abuse rate limits | 20 messages/minute and 500/day per sender; 15 new conversations/hour; 30 reports/day. Errors use SQLSTATE `PT429` (HTTP 429) | database + browser tests |
| Photo limit and listing state enforced only in the client | At most 6 photos per listing (row-locked trigger); uploads and metadata only for active listings; metadata must reference an uploaded object | `tests/database.test.mjs` |
| Avatars were public at a predictable path | `avatars` bucket is private; readable by the owner and by signed-in users who can see the profile (discoverable) | `tests/database.test.mjs` |
| Anyone signed in could list every trip's participants | Visible only to the participant and the trip owner | `tests/database.test.mjs` |
| Login CSRF: token-bearing links were accepted on web and native | Auth uses PKCE; native deep links only exchange a `code` with the verifier stored on that device | `tests/web/recovery.spec.ts` |
| Web app sent no security headers | CSP (`script-src 'self'`, `frame-ancestors 'none'`), HSTS, nosniff, referrer and permissions policy in `vercel.json` | whole browser suite run behind the policy |
| CI actions pinned to mutable tags | Pinned to commit SHAs | `.github/workflows/ci.yml` |
| Dependency gate failing on new Expo/Metro advisories | Expo 57.0.33 / expo-image-picker 57.0.21; 22 findings reduced to 3 moderate; baseline refreshed | `scripts/audit-production.mjs`, `tests/dependency-security.test.mjs` |

## Operator actions before release

- Apply the migration to staging, run the hosted two-account flow, then production; regenerate `database.types.ts` from the hosted schema afterwards.
- PKCE email links: Supabase's default `{{ .ConfirmationURL }}` templates work. Custom templates must use `{{ .ConfirmationURL }}` (not a hand-built `#access_token` link). Links now only work on the device and browser that requested them; say so in the email copy.
- A moderation process must review `reports` (service role) and act on accounts; the database now records reports but nobody is notified yet.
- If listing photos for archived listings must disappear, move `listing-media` to a private bucket with signed URLs. Object paths contain an unguessable token, so this is a privacy improvement, not an open exposure.
- Native session tokens remain in AsyncStorage. Moving to an encrypted store (for example `expo-secure-store` with a large-value adapter) needs physical-device qualification.

This checkpoint does not make Stuora GA. The live acceptance, physical-device, operations and legal gates in `GA_RELEASE_GATE.md` remain open.
