# Stuora Student Groups — controlled public MVP (2026-10-18)

**Current release state:** DRAFT PR #22, stacked on unmerged UI PR #21. This is NOT production GA. Production Supabase and production Vercel are untouched. Groups can only be claimed available in staging after the matching migration is installed, exact-head CI is green, and the staging alias points to a READY build.

## Scope — genuinely implemented

1. Discover public student-created groups by name, city and topic.
2. Signed-in student profiles create a group with name, description, city and topic.
3. Atomic group creation through `create_student_group` saves founder membership in one transaction, with a maximum of 10 active groups and three creation events in a 24-hour window, including deleted groups.
4. Signed-in students join and leave groups. Group founders cannot leave an orphan group; they can delete it after explicit confirmation.
5. Discussion is readable only to actual members. Messages are sent via `send_student_group_message` (maximum 1000 characters and ten send attempts per minute per actor).
6. Founders can edit group metadata and delete any group message; members can delete their own posts. Deleting a group removes its memberships and messages by FK cascade.
7. Browser deep-link `?stuora=groups` on Expo Web; category tile and Explore chip on web/native. Editorial Stuora artwork isn't portrayed as actual group content.

## Schema / RLS

- `public.student_groups`: public SELECT only, owner-scoped UPDATE (restricted to name/description/city/topic) and DELETE, *no client INSERT privilege*.
- `public.student_group_members`: only own membership or founder-authorized member identities readable. Authenticated students can join only as themselves. Founders may remove members, but cannot remove their own creator membership.
- `public.student_group_messages`: member-only SELECT; member-owner delete. No direct client INSERT, including for participants.
- `private.student_group_action_limits`: independent, inaccessible ledger used by security-definer RPCs; no dependency on other unfinished PR migrations. Actor-profile row locks serialize spam and quota decisions.
- SECURITY DEFINER public RPCs have explicit `search_path = ''`; anonymous EXECUTE revoked; authenticated EXECUTE only.
- Staging migration: `supabase/migrations/20261018094500_student_groups.sql`. Only apply through controlled migration tool after review, never manually mutate production.

## Verification and known exclusions

Automated gates: Postgres policy tests with and without inherited broad grants; unauthorized cross-member read/update/message cases, group removal and cascades, creator limits after deletion and message frequency limits; Playwright browser discovery and creation/edit/send/moderation/delete; existing entire suite; native JavaScript exports.

**Explicitly NOT implemented in MVP:** private/invite-only group admission, approval workflow, group photos/attachments, video calls, calendar integration, push notifications, real-time chat subscriptions, muting/banning ex-members, spam reports and moderator console. Real authenticated 2-user browser acceptance on hosted staging remains mandatory before commercial GA.

**Host-only acceptance test:** `tests/hosted/groups.sql`. It creates three temporary signed-in identities in one transaction and validates create, joining, read isolation, sender grants, founder moderation and deletion, then ROLLBACK. Never run it on the production project.

**Operational blockers:** owner/moderator report workflow, quota monitoring, abuse escalation, real-device acceptance, commercial privacy/data-retention review, and group management support. Do not describe group creation as production-ready while this remains draft.
