# Stuora — canonical SQL baseline and staging migration-history reconciliation
Date: 2026-10-22 · repo: stanleymay20/Stuora- · draft PR #23

## Why this exists
The second forensic re-audit identified real schema drift: the dedicated Supabase staging database contains migrations originally authored on draft PR #18. Fresh builds of PR #23 lacked them and therefore had no `private.limit_student_actions()` protections, even though staging did. Never claim CI and staging are identical merely because the UI and tests pass.

**Source of truth:** all 15 SQL files in `supabase/migrations/`, including two copied *byte-for-byte* from the PR #18 branch:
- `20261012181606_community_post_kind.sql`: original source Git blob `a3b47b28634ab6ef69369cb74c737b98a745d778`.
- `20261012182717_complete_category_posting_release.sql`: original source Git blob `e05e80cd2cb8792a9a5f8d88054f203bf4e0ece4`.

Both contain validated rate-limit, block and community capability code. They are followed in chronological order by Student Groups and P0 hardening migrations. **The imported release code also grants unfinished publishing RPC access; the final `20261022115000_gate_unreleased_community_writes.sql` migration immediately removes those grants, including private implementations, and blocks JWT-bearing inserts/updates of the four unreleased community categories.** The gate retains server-side rate limits and controls without activating posting/participation UI.

## Verified on live staging before the new gate
Staging project: `uptjcspizukpjcoayhtn` / Supabase Stuora connection, ACTIVE_HEALTHY.
- `listings_safety`, `messages_safety`, `reports_safety`, `job_applications_safety` are installed and invoke `private.limit_student_actions()`.
- `save_community_listing` and `listing_participation` have authenticated EXECUTE permission **until the gate migration is applied**.
- `listings_integrity_guard`, `listings_publish_requires_details` and group-message RLS repair are installed.
- Approved preview alias is **older than the branch**; never equate READY with exact-head qualification.
- Production project `mljmifovcthvtuquvyzf` is NOT the target of this work.

## Crucial: historical versions differ from repository filename timestamps
Prior staging changes were installed via MCP apply_migration, which generated deployment-time versions and stored their original filenames as migration names. Therefore **DO NOT run `supabase db push`, `supabase db reset --linked`, automatically deploy all migrations, or manually replay historical SQL against staging** based solely on file timestamps.

| Canonical repo file | Staging migration recorded version | Staging stored name |
| --- | --- | --- |
| 20261011020220_verified_foundation.sql | 20261017221756 | 20261011020220_verified_foundation |
| 20261011020517_tighten_detail_policies.sql | 20261017221758 | 20261011020517_tighten_detail_policies |
| 20261011022529_persist_student_listings.sql | 20261017221800 | 20261011022529_persist_student_listings |
| 20261011135933_secure_listing_messaging.sql | 20261017221802 | 20261011135933_secure_listing_messaging |
| 20261011140005_privatize_listing_messaging_rpc.sql | 20261017221804 | 20261011140005_privatize_listing_messaging_rpc |
| 20261011142545_public_student_media.sql | 20261017221806 | 20261011142545_public_student_media |
| 20261011143918_secure_listing_messaging.sql | 20261017221808 | 20261011143918_secure_listing_messaging |
| 20261012014031_restore_private_listing_messaging.sql | 20261017221810 | 20261012014031_restore_private_listing_messaging |
| 20261012181606_community_post_kind.sql | 20261018045510 | 20261012181606_community_post_kind |
| 20261012182717_complete_category_posting_release.sql | 20261018045616 | 20261012182717_complete_category_posting_release |
| 20261018094500_student_groups.sql | 20261018081030 | student_groups |
| 20261022033000_fix_student_group_message_rls.sql | 20261022040638 | fix_student_group_message_rls |
| 20261022050000_private_profile_and_explicit_cities.sql | 20261022042742 | private_profile_and_explicit_cities |
| 20261022053000_listing_integrity_guard.sql | 20261022043800 | listing_integrity_guard |
| 20261022115000_gate_unreleased_community_writes.sql | 20261022052123 | gate_unreleased_community_writes |

## Safe promotion protocol
1. Review the canonical sources and check both independent RLS job and full CI at the exact SHA, including browser and Expo gates.
2. In staging **read current** `supabase_migrations.schema_migrations`, `pg_policies`, `pg_trigger`, `pg_proc` privileges; compare to the map and check *full definitions* and permissions, not merely names.
3. Do not use an auto migration push across the historical-version mismatch. Migration-history repair, if ever necessary, must be explicitly reviewed, backed up and executed as a separately approved release operation. It alters history but not database objects.
4. Apply only the **new, not-yet-applied** gate migration to the **staging** project after exact-head green CI. Verify the applied migration history plus direct grants and trigger behavior. No real-user fixtures or data alteration.
5. Test authenticated attempts to call both public and private unfinished RPCs, insert direct event/trip/job/post parents, and create valid housing/marketplace listings.
6. Keep the existing approved staging Vercel alias on its last verified build until exact-head deployment + browser validation is possible. Preserve production unchanged.
7. For GA, require a fresh database from repository history to pass the same authorization and abuse tests, plus true JWT-hosted tests. Tests with mocked PostgREST do **not** establish live-hosted protections.

## Security boundaries still outstanding
- Published listing detail deletion, NULL price, price/rent divergence, whitespace cities, archived reopening.
- Group ban/rejoin semantics, media EXIF and public bucket lifetime.
- Real two-student hosted acceptance and operational readiness.
- UI gate ≠ API gate; no new deals/Stripe/LLM publishing is authorized.


## Verified staging closure — 2026-10-22
- Exact-head CI #39726912374 at `e5d8cd6dcce891671cc6ade119432a4ce09d75f2` passed both `verify` and `rls-authorization`.
- Applied only `gate_unreleased_community_writes` via the Stuora staging Supabase connection to `uptjcspizukpjcoayhtn`; Supabase returned success; migration stored as `20261022052123`.
- Read-back of `pg_proc` + `has_function_privilege` confirms anonymous and authenticated roles have **no EXECUTE** on `public.save_community_listing`, `public.listing_participation`, `public.review_job_application`, or private counterparts.
- No production writes, no staging alias promotion; hosted JWT-negative tests still pending. Earlier timestamp migration versions must not be blindly replayed.


## Listing integrity closure — staging

- Forward-only `supabase/migrations/20261022140000_enforce_complete_listing_integrity.sql` committed at [`769fcf67`](https://github.com/stanleymay20/Stuora-/commit/769fcf67b0c1e4967705f7363118b55e984a7886).
- Exact-head GitHub [CI #39728278272](https://github.com/stanleymay20/Stuora-/actions/runs/39728278272) passed both `verify` and independent `rls-authorization` jobs; automated Postgres tests cover missing/whitespace cities, required public prices, mismatch between rent and parent price, detail deletion, archived reopen denial and normal atomic RPC editing.
- Applied **staging only** to `uptjcspizukpjcoayhtn` via reviewed migration with name `enforce_complete_listing_integrity`, stored version `20261022053705`. Staging had zero profiles/listings at preflight.
- Verified live `pg_constraint` readback: `profiles_city_nonblank`, `listings_city_nonblank`, `listings_published_price_required`. Verified live `pg_trigger` readback: `listings_publish_requires_details`, `housing_details_preserve_published_integrity`, `marketplace_details_preserve_published_integrity`, and existing `listings_safety` rate limiter preserved.
- Deferred commit-time checks read the final parent-child state so atomic listing/rent edits remain valid. **Not a claim of hosted real-account acceptance**. Keep draft PR #23, main/prod unchanged and approved staging alias on last previously qualified preview. Fresh-database CI tests and staging schema checks passed; full JWT and concurrency qualification remains.
- Historical migration versions remain noncanonical; do **not** run automatic `supabase db push` against staging.


## Owner moderation and durable removal — staging

- GitHub draft PR #23 latest fully tested change: `c7ef51f92a18d9e3c0e1e3cde99a5b5660a2a0b3`; full GitHub [CI #39730910971](https://github.com/stanleymay20/Stuora-/actions/runs/39730910971) **SUCCESS**, both `verify` and `rls-authorization` jobs. A SQL dollar-quote error in an earlier attempt was fixed before staging migration.
- Applied forward-only `supabase/migrations/20261022160000_student_group_owner_removal_bans.sql` **only** to Stuora staging `uptjcspizukpjcoayhtn` under migration name `student_group_owner_removal_bans`; Supabase returned success and recorded version `20261022060126`.
- PostgreSQL metadata readback confirms owner-scoped `student_group_bans_owner_read`, self-only membership leave policy, `student_group_members_prevent_banned_join` BEFORE INSERT trigger and `student_group_messages_verify_membership_at_insert` BEFORE INSERT trigger. The new owner-only removal/restore RPCs retain approval and role checks inside the database.
- Parent group row locks serialize join and message insertion with owner ban/removal; voluntary leave remains reversible. Owner restoring eligibility does **not** auto-add the member. New owner moderation panel and browser tests cover confirmation and restore controls.
- **Outstanding:** hosted JWT two-student real backend tests not executed (private staging credentials + explicit fixture permission required), concurrency behavior not independently tested under live simultaneous clients, UI new code not yet promoted to approved staging hostname. Production unchanged. Not closed-beta/GA-qualified.
