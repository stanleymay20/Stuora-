# Stuora 0.1.7: independent security and release audit (24 Nov 2026)

**Scope:** PRs #39–#43, the live Supabase staging project `uptjcspizukpjcoayhtn` (read-only, plus rollback-only transactions), the Supabase security and performance advisors, and the shared Expo/React Native client (web, Android, iOS).

**Audit branch:** `claude/audit-0.1.7-fixes`, stacked on PR #43 (`1178eb8`).

**Evidence labels used below:**
- **Verified:** reproduced or read back.
- **Simulated:** test identities against the real staging rules inside a rolled-back transaction.
- **Automated:** PGlite, Node or Playwright tests.
- **Untested:** not exercised.

## 1. Findings

| ID | Sev | Component | Finding | Status |
|---|---|---|---|---|
| F-01 | **P1** | `src/listings/listingPhotoUrls.ts` (from #40) | A signed-photo request still in flight when Student A signed out finished later and wrote A's signed URL into the cache. The cache was also cleared only in an `App` effect, after the next viewer's first render. A shared device could hand Student B, or a signed-out or non-GISMA viewer, a working capability URL issued to A. | **Fixed by PR #43** (author: owner): epoch-scoped batches, plus a synchronous clear in `AuthProvider`. Independently verified. |
| F-02 | P3 | `useListingPhotoUrl` | After a viewer change, a still-mounted image kept the URL it had already resolved. Latent: every caller remounts on a user change (`ListingWorkspace` key = user ID). | Fixed `b1e814d` |
| A-01 | P2 | `consume_listing_photo_attempt` / `listing-photo-intake` | Photo admission checked ownership but not GISMA eligibility. A legacy non-GISMA owner could still add photos to an old listing. | Fixed `94368f1` (migration `20261124130000`) |
| A-02 | P2 | `listings_read_student_catalogue_or_owned` | The catalogue checked the **viewer** but not the **owner**. A listing left by a non-GISMA or rejected account stayed visible to students. | Fixed `94368f1` |
| A-03 | P3 | `trip_participants` grants | UPDATE was granted on `trip_listing_id` with no UPDATE policy. Blocked today by RLS, but one future policy away from moving a participant onto an unapproved trip. | Fixed `94368f1` (grant revoked) |
| A-04 | P3 | `private.activity_reviews` | Reviewer foreign key unindexed (advisor). | Fixed `94368f1` |
| U-01 | P3 | Both moderator queues | A double tap sent a second decision. The server rejected it (row lock, no corruption), but its error replaced the success notice. | Fixed `5b300a6` |
| U-02 | P3 | `AccountPanel` | "Student status: unverified" was shown to students with full access. No student-number verification exists. | Fixed `5b300a6` (truthful access label) |
| S-01 | P2 | Auth setting | Leaked-password protection is disabled (advisor WARN). | **Open: owner action.** Dashboard → Auth → Password security. |
| S-02 | P2 | Storage `listing-media` | The bucket is public. Anyone who has a photo's object URL can download it. | **Open by design** until `20261124121000` is applied after the 0.1.7 builds are tested. Staging holds 0 objects. |
| S-03 | P2 | Signed URLs | Clearing local URLs does not revoke issued tokens; one stays valid until its 1-hour expiry. | **Accepted, bounded.** Lower `TTL_SECONDS` to tighten. |
| P-01 | P2 | Product | No student-number or registry verification exists. Eligibility is a confirmed `@gisma-student.com` email plus a non-rejected profile. | **Open: product decision.** Documented, not implied. |
| P-02 | P3 | Groups | Groups created by legacy non-GISMA owners before the rules stay visible to students. Their owners can no longer post. | Accepted; revisit if any exist in production. |
| P-03 | P3 | Moderator UI | The review queue shows the post and its details, but not the author's name or history. | Open, P3. |

**No P0 was found.** The only P1, F-01, is fixed and verified.

## 2. Supabase advisor review (staging, 24 Nov)

- **`rls_enabled_no_policy` (12): intended deny-all, accepted.**
  - Eleven tables in `private` are reached only by definer functions and the service role.
  - `public.moderators` has no client grants, so self-assignment is impossible (verified).
- **`authenticated_security_definer_function_executable` (19): all accepted.**
  - Each is a deliberate RPC. All 19 bodies were read; every one derives the actor from `auth.uid()` and checks membership, ownership, moderator status or the GISMA rule before acting.
  - None trusts a caller-supplied user ID.
- **`auth_leaked_password_protection`:** S-01 above.
- **Performance:** 4 unindexed foreign keys (one fixed, A-04; three P3 on low-volume moderation tables) and 23 unused indexes. Staging has no traffic, so unused indexes are not evidence; none were dropped.

## 3. PR #43 verification (photo cache)

Independent test results:
- **Race tests:** 4 original plus 4 new (rapid switches with out-of-order replies, shared concurrent requests, partial signing, expiry, synchronous listener notification), all passing.
- **Mutation:** removing the post-signing epoch check fails 3 of them.
- **Session paths:** every session change passes through `updateSession` (`onAuthStateChange` and the initial `getSession`). Token refreshes for the same user do not clear the cache.
- **Not tested in a real browser:** the React hook path F-02, which is covered by code review and the listener test.

## 4. Live staging state (verified)

**Migrations applied:**
- `20261124205516 require_gisma_student_access`
- `20261124205611 student_activity_review`
- `20261124205628 student_only_catalogue`

All 14 function bodies match the repo by md5.

**Not applied:**
- `20261124121000` (private bucket): `listing-media` is still public.
- `20261124130000` (audit hardening): dry-run only. Its rollback-only run on staging passed 8/8 and left staging unchanged.

**Rollback-only acceptance on staging (simulated identities):**
- 51/51: GISMA access, review, catalogue
- 13/13: group files
- 8/8: hardening dry run

Real-user acceptance: **untested**.

## 5. Traceability (P1)

| Finding | Fix | Regression test | CI |
|---|---|---|---|
| F-01 | PR #43: `5a60c68`, `e5ca119`, `f0a6424`, `5c6c513`, `f65d9e0` | `tests/photo-session-cache.test.mjs`: 4 original + 4 new cases (`b1e814d`) | PR #43 run 45501671140 passed; audit PR CI on the final head |

The P2 fixes A-01 and A-02 are covered by the `Audit hardening` test in `tests/database-gen3.test.mjs`, which fails without the migration, and by `tests/staging-rollback.test.mjs`, which proves the exact rollback.
