# Stuora 0.1.7 student-only release candidate: readiness checklist (24 Nov 2026)

**Status: staging candidate.** Not approved for production, store distribution or merge.

## 1. What this candidate contains

Integration branch: `claude/stuora-0.1.7-integration`. It sits on top of `work/student-api-access-0.1.7` (`a17dcea`), which is the code staging already runs and which contains `release/ios-testflight-0.1.7` (`b889262`).

| Layer | Commits |
|---|---|
| #39: GISMA-only access, moderator review | `fcfc8ab`, `e61d3a0`, `5882eed` (merged with `a17dcea` in `fa939e6`) |
| #40: student-only catalogue, signed photo URLs | `4a592f8` |
| #41: Expo SDK 57 patch alignment | `58704c1` |
| Integration: rollbacks, staging acceptance scripts, moderator review screen | `ec007f3`, `c54af8f`, `767da3f`, plus this checklist |

The PRs #39, #40 and #41 keep their tested heads. Their base branch is unchanged.

## 2. Supabase staging (`uptjcspizukpjcoayhtn` only)

**Applied 24 Nov 2026, in order:**

| Repo migration | Staging version | Read-back |
|---|---|---|
| `20261124100000_require_gisma_student_access` | `20261124205516 require_gisma_student_access` | 9/9 function bodies match the repo by md5; 22 `a_student_guard` triggers; 8 `a_student_only_read` policies |
| `20261124110000_student_activity_review` | `20261124205611 student_activity_review` | 5/5 function bodies match; 8 review triggers; review columns and the private audit table are present |
| `20261124120000_student_only_catalogue` | `20261124205628 student_only_catalogue` | Catalogue policies are `authenticated` only; the three old policies are gone. The only public tables `anon` can read are verified student offers. |

Preflight, done beforehand:
- Live definitions were captured and the rollbacks were written from them (`supabase/rollback/*.down.sql`).
- A PGlite round trip proves the rollbacks restore the exact schema (`tests/staging-rollback.test.mjs`).
- The SQL was dry-run on staging inside `BEGIN … ROLLBACK`, and the absence of leftovers was confirmed.

**Not applied:** `20261124121000_private_listing_media_bucket`. The `listing-media` bucket is still **public**, by design.

**Unchanged:** all 8 Edge Functions keep their previous versions and code hashes, including the four group-file functions. Production `mljmifovcthvtuquvyzf` was not touched.

**Live data after the migrations:**
- The one non-GISMA account is hidden from the directory and is no longer eligible.
- The one GISMA account is unaffected.
- There are 0 listings, groups, moderators and community posts.

## 3. Acceptance evidence, graded

### Live staging, rollback-only, SIMULATED identities: 64/64 passed

These scripts run against the real staging policies, triggers and functions:
- `tests/hosted/stuora-gisma-review-staging-rollback.sql`: **51/51**
- `tests/hosted/stuora-group-files-gisma-staging-rollback.sql`: **13/13**

Every identity was created inside the transaction and discarded, and no real account was read or changed. Leftover checks afterwards found 0 QA users, rows or queue entries.

What the checks covered:
- **Signup hook verdicts:** exact `@gisma-student.com` is accepted; lookalike, subdomain, `.co` and empty addresses are rejected.
- **Review lifecycle:** submit → pending (author only) → the student cannot self-approve or call review → another student cannot see, RSVP through the current RPC, the old 0.1.x RPC or a direct insert, nor read the queue → a staff moderator who is not a GISMA student must give a reason, then approves or rejects → the author is notified → the approved post is visible and RSVPs work → the rejected post stays hidden and closed to applications → editing an approved post hides it again → the reviewer audit table is unreadable to students.
- **Non-GISMA account:** cannot read others' listings, group names or profiles, and cannot create listings or groups, join groups, report, enter the directory or use Events/Jobs data. It keeps its own profile, can hide it, export its data, block accounts, and leave groups.
- **Signed-out visitor:** reads 0 listings, details, photo records, groups or event details.
- **Suspended student:** cannot publish or create groups, and can still report harassment.
- **Unconfirmed GISMA address:** cannot create a profile.
- **Quotas:** refused for the non-GISMA account and the suspended student; a student is admitted.
- **Group files:**
  - a GISMA member sees approved files only, and downloads are allowed;
  - a legacy non-GISMA member sees no files and cannot download;
  - a ban hides files even when a membership row exists;
  - the uploader sees approved and pending files;
  - an unscanned PDF cannot be approved;
  - deletion queues storage cleanup.

### Automated (local; CI on the final head is in §5)

| Suite | Result |
|---|---|
| Database (PGlite) | 19 tests, including the rollback round trip and the GISMA, review and catalogue tests |
| Node | 147 tests |
| Browser (desktop and mobile web) | 192 passed, 6 skipped. Includes the catalogue gate, signed photo URLs and the moderator review screen |
| Other checks | typecheck; secret scan (312 files); native iOS/Android export; production audit 3/3 baseline |

### Real users and devices: NOT DONE

No real two-student acceptance has been run. Staging has one GISMA student, no moderator, and no tester devices on the 0.1.7 build. None of the evidence above is real-user acceptance.

## 4. Remaining blockers before production

1. **Real two-student staging acceptance**, on Android, iOS and the web preview, with a moderator approved by the owner. Steps are in §6.
2. **A staff moderator account** chosen by the owner and added to `public.moderators` on staging. Nobody has been assigned.
3. **Signup hook:** the function is deployed and its verdicts pass on staging (§3); it is **not enabled**. Enable it on staging only after step 1 includes a fresh non-GISMA signup attempt, and after confirming the rollback below.
   - Rollback: Dashboard → Authentication → Hooks → disable **Before User Created**.
4. **Email delivery:** staging uses Supabase's default sender, which reaches project-team addresses only. Custom SMTP is required before ordinary students can confirm or recover accounts.
5. **0.1.7 client builds:** none distributed yet. A new EAS build for Play Internal and TestFlight needs owner approval. The web preview needs a Vercel build of the final commit.
6. **Private photo bucket** (`121000`): apply only after testers on the new builds confirm photos load through signed URLs. Installed 0.1.6 apps use public URLs and will lose photos when it is applied. Staging has 0 photos today.
7. **Merge path:** `main` is the Vercel production branch. Merge only into a release branch the owner names, never straight into `main` (§6).

## 5. Exact tested commit

CI on the final integration head: see PR "Stuora 0.1.7 integration" against `feat/stuora-0.1.7-staging-base`. That PR's description records the head SHA and the run links.

## 6. Recommended sequence

1. **Review** the integration PR. Keep #39, #40 and #41 open as the record of their own tested heads.
2. **Moderator:** the owner names a staff moderator, and that account is added to staging `public.moderators`.
3. **Two-student staging test** on Android, iOS and web with the 0.1.7 build, against the already-migrated staging. Use two consenting GISMA students, A and B, plus the moderator M.
   - A posts a Housing listing with a photo; B sees it.
   - A submits an Event and a Job; B cannot see either; M approves the Event and rejects the Job.
   - B RSVPs to the Event and cannot apply to the Job; A edits the Event and it is hidden until re-approved.
   - A non-GISMA account sees the student-only gate.
   - Login, logout, password recovery on the same device, and session expiry.
4. **Signup hook:** enable it on staging and retest a non-GISMA signup (refused) and a GISMA signup (allowed).
5. **Photo bucket:** after testers confirm signed photos, apply `121000` on staging and retest photos on all three platforms. Rollback: `supabase/rollback/20261124121000_private_listing_media_bucket.down.sql`.
6. **Merge:** the owner chooses the release branch (for example `release/0.1.7`). Merge the integration branch there with CI green on the merge commit.
7. **Production:** a separate, owner-approved change covering the production migrations, hook, SMTP, store builds and storage. Nothing here touches production.
