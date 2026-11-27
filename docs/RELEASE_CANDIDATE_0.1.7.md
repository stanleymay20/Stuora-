# Gismate / Stuora 0.1.7 release candidate — inventory and go/no-go

Snapshot: 27 Nov 2026 (evening update), branch `release/rc-0.1.7-20261127`, PR #52 (stacked on #51).
Nothing in this release is merged to `main` and production has not been touched.

## Branch stack (all drafts, none merged)

`main` ← #42 integration ← #43 signed-photo fix ← #44 audit fixes ← #45 moderator race
← #46 jobs integrity ← #47 location engine (#48 = #47 against `main`, for review)
← #49 Student Savings ← #50 scholarships ← #51 My first 30 days ← this branch.

CI was green on every tip checked (#49 `2cf8bc9`, #50 `61c5b2e`, #51 `8fcb625`).
Merging means promoting the stack in order or merging #48's combined diff after
review; production migration history needs reconciling first (see the rollout pack).

## How to read the evidence columns

- **Local web**: Playwright against the exported web app with a mocked backend, desktop
  Chromium and an emulated Pixel 7 (206 passed, 12 skipped by design, 27 Nov).
- **Staging DB**: rollback-only SQL acting as simulated students on the real staging
  policies and functions. Backend evidence, not app evidence.
- **Staging app**: the signed-in app on an approved staging preview.
- **Device**: physical Android / iPhone running the staging test build.

**Pending** means not yet run. Nothing has been run on a physical device.

## Feature inventory

Status: **Implemented** = complete primary action and error recovery in code;
**Partial** = shipped behind a switch or missing a step; **Planned** = mentioned in
planning only.

| # | Feature | Entry point | Backend / data | Access | Status | Live content on staging | Evidence | Blocker |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Registration (GISMA only) | Profile → Create account | Supabase Auth `signUp`, signup hook `hook_require_gisma_signup`, `profiles` | Public form; only `@gisma-student.com` admitted | Implemented | n/a | Hook verdicts in rollback test `stuora-gisma-review`; staging: hook function installed and executable by `supabase_auth_admin` | **Activation not confirmed**: it is an Auth setting, not visible in SQL; staging already holds 1 non-GISMA account. Even without the hook, non-GISMA accounts get no student data (staging DB journey) |
| 2 | Email confirmation | Link in email → `stuora://auth-callback` / web origin | `exchangeCodeForSession` | Owner of the inbox | Implemented | n/a | Local web | Redirect allowlist must contain `stuora://auth-callback` (unverified); device step 1.1 |
| 3 | Sign-in, password recovery | Profile | Supabase Auth | Public | Implemented | n/a | Local web | Device step 1.4 |
| 4 | Profile, discovery opt-in | Profile | `profiles`, `set_profile_discovery` | Signed-in | Implemented | — | Local web; staging DB (profiles hidden from non-GISMA and signed-out) | — |
| 5 | Data export, account deletion | Profile → My data | `export_my_data`, `delete-account` function | Owner, password + phrase | Implemented | — | Local web | Device step 4.4 |
| 6 | My first 30 days | Home → My first 30 days (public) | Official links; progress in device storage per student | Guide public; saving needs a confirmed student | Implemented | 3 home cities, 2 campuses (Donaustraße 42, 12043 Berlin; Konrad-Zuse-Ring 11, 14469 Potsdam, both from GISMA's contact page); ticket help: potsdam.reception@gisma.com (GISMA guide, Jan 2024) with the contact page as fallback | Local web: Brandenburg-home/Berlin-campus journey, save/reload, account switch | — |
| 7 | Housing listings | Home, Explore → Housing | `listings`, `housing_details`, `save_student_listing` | Confirmed GISMA students | Implemented | **0 listings** | Local web; staging DB (catalogue hidden from non-GISMA/signed-out) | Needs real listings to be useful |
| 8 | Marketplace + free items | Explore → Marketplace → Show free items | `listings` (`price_cents = 0`) | Confirmed students | Implemented | **0 listings** | Staging DB: free desk found by B with the free filter; local web | — |
| 9 | Listing photos | Create listing | `listing_media`, storage | Owner | **Partial**: uploads paused in the app | — | Local web (paused notice) | Private media bucket cutover pending two-student signed-photo test |
| 10 | Contact the lister | Listing → Message | `start_listing_conversation`, `conversations`, `messages` | Confirmed students | Implemented | — | **Staging DB 27 Nov: 27/27 checks passed**, rolled back (see Scenario results) | Signed-in app and device runs pending |
| 11 | Messaging, blocking | Messages | `messages`, `set_conversation_block`, `user_blocks` | Members only | Implemented | — | Staging DB: block stops B | — |
| 12 | Reporting, moderation | Report button; Profile → moderation queue (moderators) | `report_content`, `reports`, `ModerationQueue` | Students report; moderators review | Implemented | **0 moderators on staging** (27 Nov) | Staging DB: C reports the desk; `stuora-gisma-review` moderator tests | A named moderator and procedure before GA |
| 13 | Student directory | Explore → People | `profiles` where opted in | Confirmed students | Implemented | 1 GISMA account | Local web | — |
| 14 | Groups (create, join, chat, remove/restore members) | Explore → Groups | `student_groups`, `*_members`, `*_messages`, `*_bans` | Confirmed students | Implemented | 0 groups | Local web; hosted `groups.sql` | — |
| 15 | Group files | Group → Files | `student_group_files`, ClamAV scanner | Members | **Partial**: off unless the staging build sets group-file switches; PDF scanner compiled off | — | Rollback tests `stuora-group-files-*` | Scanner deployment + processing agreement |
| 16 | City search (DE, AT, CH) | City chip → Check | `external-data` → `geo_city_search` (GeoNames) | Confirmed students | Implemented (switch now on in staging device builds) | 108,888 places | Staging DB queries; your signed-in preview check on 26 Nov (Wien, Zürich, Paris) | Production data load |
| 17 | Local events | Explore → Events | Ticketmaster via `external-data` (by position, place's country) + student events (moderated) | Confirmed students | Implemented | Ticketmaster live; 0 student events | Staging app 26 Nov (v22/v23 checks) | Ticketmaster quota monitoring |
| 18 | Trips + transport links | Explore → Trips | `trip_details` (moderated), Deutsche Bahn link-out; VBB in arrival guide | Confirmed students | Implemented | 0 trips | Local web | — |
| 19 | Student assistant | Floating bot (Home, Explore) | `stuora-assistant` (Groq, ZDR enabled 26 Nov) | Confirmed students | Implemented (switch now on in staging device builds) | Answers from Stuora data only | Staging app 26 Nov | Device step 4.1 |
| 20 | Student Savings catalogue | Header → Student Savings | `student_benefits`; RLS shows only verified offers inside their start/end dates | Legacy offers public; partner offers students only | Implemented | **0 offers** | Staging DB 27 Nov (temporary offers, rolled back): student sees current only; expired, future, unverified hidden; local web | Real partner offers |
| 21 | Free subscriptions, coupons, redemption | Savings → filters → Redeem with partner | `student_benefits.offer_kind`, `redemption_url` (#49) | Confirmed students | Implemented as a link-out; no tracked redemption | **0 genuine partner offers**; migration applied on staging 27 Nov (`20261127180110 student_partner_offers`) | Staging DB: non-GISMA and signed-out see no partner offer; a paid "free subscription" without terms is rejected | A genuine partner offer with written terms |
| 22 | Scholarships and grants | Savings → Browse scholarships | Two official programmes (FES, Erasmus+); progress in device storage per student | Confirmed students | Implemented | 2 programmes; FES wording from the German and English FES pages (B2 accepted without certificate, first-semester window, < 3 semesters excluded, income over €400 deducted) | Local web (save, applied, reload, FES wording) | Erasmus+ place at GISMA unconfirmed; FES master's deadline is 30 Nov |
| 23 | Student-posted jobs | Explore → Jobs | `job_details`, `job_applications` (moderated; employer/partner accounts) | Confirmed students | Implemented | 0 jobs | `stuora-jobs-lifecycle` rollback (38 checks) | — |
| 24 | External jobs (Adzuna, Bundesagentur) | Explore → Jobs (external section) | `external-data` jobs providers | Confirmed students | **Off by design** | — | `503 FEATURE_DISABLED` on staging | Adzuna: separate commercial licence needed; BA: declined for current use ([PROVIDER_DECISIONS.md](PROVIDER_DECISIONS.md)) |

## Provider dependencies

| Provider | Used for | Verified through | State | What is missing |
| --- | --- | --- | --- | --- |
| GeoNames (CC BY 4.0) | City search | Staging DB + your signed-in preview (26 Nov) | Live on staging | Production load |
| Ticketmaster Discovery | Events | Staging app (26 Nov) | Live on staging | — |
| Groq | Assistant | Staging app; ZDR enabled per your 26 Nov record | Live on staging | — |
| Adzuna | External jobs | Backend only (`503 FEATURE_DISABLED`); no trial call made | Off. Trial key allows 25 calls; Standard covers public listings only | **Separate commercial licence** for sign-in-only display (26 Nov). No plan bought. Country is fixed to `de` |
| Bundesagentur für Arbeit | External jobs | Backend only | Off: **declined for current use** (26 Nov) | New request and written approval |
| ClamAV scanner | Group files | Rollback tests only | Compiled off | Scanner deployment and processing agreement |
| Deutsche Bahn, VBB, city registration sites | Link-outs | Local web | Links only | — |

## Scenario results

| Scenario | Desktop web | Mobile web | Staging DB | Staging app | Android | iPhone |
| --- | --- | --- | --- | --- | --- | --- |
| A posts a free desk, B contacts A, both read it; C, a non-GISMA account and signed-out visitors cannot | ✅ (mocked) | ✅ (mocked) | ✅ **27/27**, rolled back, no residue (27 Nov) | Pending: Chrome unreachable; one GISMA test account exists, two needed | Pending | Pending |
| Brandenburg resident, Berlin campus: right office and directions | ✅ | ✅ | n/a | Pending | Pending | Pending |
| Student sees current offers only; partner offers hidden from others | ✅ (mocked) | ✅ (mocked) | ✅ **4/4**, temporary offers rolled back | Pending | Pending | Pending |
| Save a scholarship, reopen, same status | ✅ | ✅ | n/a (device storage) | Pending | Pending | Pending |
| Switch accounts on one device: no leaked progress | ✅ | ✅ | n/a | Pending | Pending | Pending |

Free-desk journey, staging DB (`tests/hosted/stuora-release-scenarios-staging-rollback.sql`):
A posts (active) · B finds it with the free filter · B saves it · B contacts A, a second
attempt reuses the conversation · B sends · A sees the conversation and reads it · A replies ·
A cannot see B's saved items · B reads both messages · C cannot see the conversation, its
messages or its members, cannot post (42501) or join (42501) · C sees and reports the listing ·
the non-GISMA account cannot see the desk or profiles, cannot contact A ("A confirmed GISMA
student account is required") and cannot read the messages · signed out: 0 listings;
messages, profiles and conversations refused · A blocks B; B's next message refused (42501).
Afterwards: 0 QA users, 0 listings, no conversation, 0 QA reports.

## Proposed standalone additions (not in this release)

- Progress synced across devices for the arrival guide and funding tracker (both device-only today, and labelled so).
- More home cities in the arrival guide (any GeoNames city, with its registration office).
- Tracked coupon redemption (a `benefit_redemptions` table exists; no flow uses it).
- Adzuna country chosen from the student's city (AT, CH), once jobs are licensed.
- A Geoapify fallback for cities outside Germany, Austria and Switzerland.

## Release decision (27 Nov 2026, evening)

**Not GA-ready. Production: nothing from 0.1.7 is live.** Staging is verified at the database
level for contact privacy and offer visibility, but not yet through the signed-in app or any
physical phone, and it has no real content.

Core launch blockers:
1. Physical Android and iPhone run of `DEVICE_TEST_SCRIPT.md` (builds not yet started: run
   `eas workflow:run .eas/workflows/device-test.yml` from a computer signed in to Expo).
2. Signed-in staging run of the free-desk journey with two confirmed GISMA test accounts
   (only one exists on staging).
3. GISMA-only sign-up hook: switch on in Supabase Auth → Hooks (staging and production) and confirm.
4. Auth redirect allowlist: add `stuora://auth-callback` and the production web origin.
5. Production legal details (Impressum, privacy contact): the production build refuses to start without them.
6. A named moderator (0 on staging today) and a response procedure.
7. Review and merge of the stack, then the production rollout (separate go decision).

Launch disabled: external jobs (Adzuna licence; BA declined), group files (scanner), listing
photos (upload pause), partner coupons and free subscriptions (no genuine offer yet: the screen
shows an honest empty state).
