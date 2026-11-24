# GISMA-only access and activity review: staging review

Migrations, in order:
1. `supabase/migrations/20261124100000_require_gisma_student_access.sql`: who counts as a Stuora student, enforced on writes and on private reads.
2. `supabase/migrations/20261124110000_student_activity_review.sql`: Jobs, Trips and Events publish only after a Stuora moderator approves them.

Status: **drafts, not applied anywhere.** Staging only (`uptjcspizukpjcoayhtn`) after review and green CI on the exact commit. Production is out of scope.

## Why

On live staging (read-only check, 24 Nov 2026), a confirmed non-GISMA account with a profile passed `private.is_quota_eligible`. That account could write listings, messages, reports, profiles and group memberships.

Jobs, Trips and Events went live the moment they were submitted. Confirming a university email does not show that a student represents an employer or may organise a trip. Review is done by Stuora moderators, not school administration (release checklist #26).

## Migration 1: GISMA-only access

| Part | Effect |
|---|---|
| `private.has_gisma_student_email` | Confirmed email matching exactly `…@gisma-student.com`, case- and space-insensitive. |
| `private.is_gisma_student_account` | The above plus a `student` profile that is not `rejected`. |
| `private.is_gisma_student` | The above plus not suspended. Used by quotas and community actions. |
| `a_student_guard` triggers | BEFORE INSERT on every student-writable table, and BEFORE UPDATE where students edit. Covers RLS writes and SECURITY DEFINER RPCs. |
| `a_student_only_read` policies | RESTRICTIVE read policies on profiles, messages, group messages, group members, group files, applications and trip/event participants. A signed-in non-GISMA account sees only its own rows. |
| `can_read_student_group_files` | Also requires a GISMA student. It authorises the `group-file-download` Edge Function. |
| Directory cleanup | Existing non-GISMA profiles get `is_discoverable = false`. **Live staging: 1 profile.** |
| `public.hook_require_gisma_signup` | A Before User Created hook function that rejects non-GISMA signups with 403. It is executable only by `supabase_auth_admin`. |

Exceptions, all tested:
- **Archive:** the owner may move their own listing from `active` or `reserved` to `closed`, with every other column unchanged.
- **Moderators:** they change others' listings only through moderation functions, and do not need a GISMA address.
- **Protective paths, still allowed for every signed-in account:** hiding own profile, deleting own content, leaving groups, blocking, data export, account deletion.

**Not changed, and needs a product decision.** Signed-out visitors can already browse:
- active listings and their details
- listing photo metadata
- the **public** `listing-media` bucket
- group names
- verified benefits

Signed-in non-GISMA accounts see the same catalogue. Making it student-only would mean removing anonymous browsing and making the photo bucket private, which needs signed URLs in all three clients.

## Migration 2: activity review

- `listings.review_status`:
  - `not_required` for Housing and Marketplace.
  - `pending`, `approved` or `rejected` for Jobs, Trips and Events, enforced by a check constraint.
  - Every new Job/Trip/Event starts `pending`, whoever inserts it. Existing ones become `pending`; live staging has none.
- **Visibility.** The listing read policy publishes only `active` posts that are `not_required` or `approved`. Authors always see their own. Details, photos and feeds follow the listing, so this also holds for older app versions.
- **Actions.** Joins, RSVPs, applications and new conversations on an unapproved post are refused by a trigger. That covers `listing_participation`, `student_activity_response`, direct inserts and old clients.
- **Review by moderators only:**
  - `list_pending_student_activities()` returns the queue with details.
  - `review_student_activity(id, 'approve'|'reject', reason)` requires a 10–1000 character reason. A moderator cannot review their own post. The author is told the outcome and reason through `moderation_notices` (new kind `activity_review`).
- **Privacy.** `listings` is readable table-wide by `anon` and `authenticated`. So the reviewer and the reason are stored in the private `private.activity_reviews` audit table, not on the listing.
- **Re-review.** If the author edits an approved or rejected post, including its trip, event or job details, it returns to `pending`.
- **Unchanged.** Ticketmaster browsing (`external-data`), Housing and Marketplace.

App (0.1.7 source): after submitting, the student sees "Submitted for review". Their own pending or rejected posts carry a label. Older apps need no change for safety; they never receive other students' pending posts.

## Pre-apply checks done (read-only, live staging)

- No function, trigger or policy name collisions.
- All guarded tables exist.
- 0 moderators would be affected.
- 0 Job/Trip/Event listings exist.
- The `listings` column and table grants were read back, which is why the reviewer is kept off the listing.

## Apply (operator)

1. Green CI on the exact commit.
2. Apply both migrations to staging only, in order.
3. Read back:
   - the `a_student_guard` triggers and `a_student_only_read` policies;
   - `listings_read_published_or_owned`;
   - `b_require_published_activity` on four tables;
   - `private.is_quota_eligible` for the non-GISMA account, which should be `false`.
4. Add at least one staff account to `public.moderators`.
5. Dashboard → Authentication → Hooks → **Before User Created** → Postgres → `public.hook_require_gisma_signup`. Enable it on staging.
6. Then deploy the 0.1.7 client, which reads `review_status`.

## Retest (the release proof)

1. Student A (GISMA) submits an event. It shows "Awaiting Stuora review" for A, and does not appear for Student B, for a signed-out visitor, or on an older app.
2. B cannot RSVP.
3. A moderator approves it. A gets the notice, B now sees it, and B can RSVP.
4. A edits it. It is hidden again until it is re-approved.
5. A job that the moderator rejects stays hidden, and nobody can apply.
6. A non-GISMA signup is refused. The existing non-GISMA account:
   - sees only its own profile and messages;
   - cannot post, message, join, report or download group files;
   - can still export its data, delete its account and block.
7. Events from Ticketmaster still browse for GISMA students.

## Rollback

Disable the hook. Then, in one transaction, reverse migration 2 and then migration 1:
- drop the new triggers, policies and functions;
- restore `listings_read_active_or_owned`, the old `moderation_notices` kind check, and the previous `is_quota_eligible`, `require_community_student` and `can_read_student_group_files` bodies;
- drop the `review_status` and `reviewed_at` columns and `private.activity_reviews`.

The directory cleanup is not reversed automatically.

## Tests

`tests/database-gen3.test.mjs`:
- **GISMA-only:** reads and writes for an outsider who held memberships before the migration; the narrowed archive rule; lookalike domains; hook privileges.
- **Activity review:** the full submit → hidden → refused → approve → discover and act → edit → hidden again sequence; rejection; audit privacy; Housing unaffected; staff moderation still works.

`tests/database.test.mjs`: the publish loop now requires approval by a non-GISMA staff moderator before student B can join or apply.

Mutation checks:
- Removing migration 2 fails the review test.
- Restoring the broad archive rule fails the archive assertions.

Locally: 16/16 database tests, all Node tests, typecheck and 182 browser tests pass. CI has not yet run on this commit.
