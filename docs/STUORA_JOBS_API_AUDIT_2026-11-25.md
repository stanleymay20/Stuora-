# Stuora Jobs API — audit, live checks and repairs (25 Nov 2026)

Branch `audit/jobs-api-20261125`, stacked on `feature/stuora-moderator-double-submit-20261124`
(PR #45 head `f7d2638`, which already contains #42, #43 and #44).

**Verdict: the Jobs feature is NOT GA-ready.** Student-posted Jobs work end to end on
staging (rollback-only, simulated users). External Jobs are **disabled on staging**: no
licensed job provider is configured, so no live vacancy has reached any student. This is a
licensing/credentials blocker, not a code defect, and no code change can or should remove it.

## A. Operational verdict

| System | Status | Evidence |
|---|---|---|
| External Jobs API | **Disabled** | `external-data` v19 ACTIVE; deployed source identical to the repo. The function's own boot log (24 Nov 2026 08:11 UTC) reports `feeds: ["ticketmaster"]`, so `kind: "jobs"` returns `503 FEATURE_DISABLED` by design. `private.external_cache` holds no Adzuna or BA entries. |
| Adzuna | **Blocked** (licence) | Provider is absent at boot: at least one of `ADZUNA_APP_ID`, `ADZUNA_APP_KEY`, `ADZUNA_COMMERCIAL_LICENSE=confirmed` is unset (values not read). Adzuna's API terms allow commercial use only for a 14-day trial; any revenue- or lead-generating product needs a signed licence agreement. |
| Bundesagentur | **Blocked** (permission) | `BA_JOBSUCHE_ENABLED` is not `true`. The BA publishes no API terms; the community docs (bundesAPI) state there is no official API and give no licence. Do not enable without written BA permission. |
| Student Jobs | **Working** (DB, simulated) | Rollback-only staging run of `tests/hosted/stuora-jobs-lifecycle-staging-rollback.sql`: 38 checks, 37 passed first time; the one miss was a wrong expectation (a duplicate direct insert is refused by the unique constraint, `23505`, not `42501`) and the assertion was corrected. Two real defects found and fixed in a draft migration (J-DB-1, J-DB-2). Staging has 0 job listings, 1 confirmed GISMA student, 0 moderators. |
| Jobs search | **Partial** | Request validation, quotas, caching, outage handling, dedupe and concurrency verified with **mocked** provider responses (Deno) and **mocked** function replies (Playwright). No live search possible while providers are disabled. |
| Android Jobs | **Unverified** | No device run. |
| iOS Jobs | **Unverified** | No device run. |
| Web Jobs | **Verified (mocked backend)** | Playwright desktop Chrome + Pixel 7 mobile-web: 8/8 external-feed journeys pass against a fixture `external-data`. Not a live verification. |

## B. Defects and repairs

| ID | Sev. | Defect (reproduced) | Root cause | Fix | Regression evidence |
|---|---|---|---|---|---|
| J-API-1 | Medium | Concurrent identical searches each call the provider (5 students → 5 Adzuna calls), burning quota/rate limit. | No in-flight coalescing between cache miss and cache write. | `core.ts`: per-isolate in-flight map keyed `provider|city|query`; entries removed on settle. | `jobs: concurrent identical searches share one provider call` — fails on old code, passes now. |
| J-API-2 | Medium | The same vacancy syndicated to Adzuna and the BA is listed twice. | De-duplication by provider id only. | Second key on normalised title (gender suffix `(m/w/d)` stripped), employer and place; newest copy kept; deterministic id tie-break. | `jobs: the same vacancy from Adzuna and the BA is shown once` — fail → pass. |
| J-API-3 | Medium | A cache-write failure turned a successful provider reply into "source unavailable". | `cachePut` inside the provider `try`. | Cache write isolated; failure logged (`cache_put_failed`), vacancies still returned. | `jobs: a failed cache write keeps the vacancies…` — fail → pass. |
| J-API-4 | Low | Stale advertisements could be shown (no age bound, relevance order). | No recency parameters sent. | Adzuna `max_days_old=30`, `sort_by=date`; BA `veroeffentlichtseit=30`. | `jobs: requests ask providers for current ads only…` — fail → pass. |
| J-API-5 | Low | BA adapter drops every item if the search moves to the `/pc/v6` shape, which renames `refnr` to `referenznummer` (per bundesAPI docs). | Field name hard-coded. | Accept both; still always link to the official BA detail page, never `externeUrl`. | `jobs: BA accepts the v6 referenznummer…` — fail → pass. |
| J-UI-1 | Low | "Retry external jobs" shown when Jobs are disabled; retrying can never succeed. | Retry rendered for the `disabled` phase. | Retry only for errors/outages. | Playwright `external jobs: disabled providers say so without a pointless retry` — fail → pass. |
| J-UI-2 | Low | "Refresh listings" refreshed Stuora jobs but never re-requested external jobs. | `ExternalFeed` did not observe the catalogue revision. | `refreshKey` prop wired to the catalogue's revision. | Playwright `…attributed, link out, flag partial outages and refresh` — fail → pass. |
| J-DB-1 | Medium | A withdrawn application could be revived by `update job_applications set withdrawn_at = null` (reproduced on staging, rollback-only). The employer then sees it as live. | `authenticated` holds `UPDATE(withdrawn_at)`; only the RPC refused resubmission. | Draft migration `20261125090000`: trigger makes withdrawal one-way for client writes. Deleting one's own application remains allowed (erasure). | PGlite test `Jobs audit J-DB-1/J-DB-2` — fails without the migration, passes with it; rollback-only staging dry run 6/6. |
| J-DB-2 | Low | Rejected Jobs tell the author "You can edit it and it will be reviewed again", but Jobs cannot be edited (no client write path — verified on staging). | Shared notice text for Jobs/Trips/Events. | Jobs notice now says: close it and post a corrected job. | Same PGlite test; staging dry run. |
| J-CI-1 | Medium | The external-feed browser spec ran only on `release/android-internal-*`; on every PR it was silently skipped. Green PR CI said nothing about Jobs UI. | `if:` condition on the CI step. | Step now runs on every CI run. | `.github/workflows/ci.yml`. |

Not changed (documented risks):
- **Location precision.** Providers receive the city as free text (`where`/`wo`). "Brandenburg an der Havel" may be matched by Adzuna against the state of Brandenburg. Needs a live check once a provider is licensed.
- **Delete-and-reapply.** A student can delete their own withdrawn application and apply again (rate-limited, 20/hour). Kept because deletion is the erasure path; product decision.
- **Over-quota partial cache.** A student over quota gets `429` even when some providers are cached. Minor.

## C. Live API results

| Check | Context | Outcome |
|---|---|---|
| Authenticated `feed`/`jobs` Berlin "Werkstudent" | **Not executed.** This workspace's network blocks `*.supabase.co`, `api.adzuna.com` and `rest.arbeitsagentur.de`, and no staging student credential was provided. | — |
| Expected result if executed now | Derived from the boot log and code: `503 {"code":"FEATURE_DISABLED"}` for every city/query. | 0 vacancies; not evidence of a working integration. |
| DB-side gates on staging (rollback-only, simulated users) | Quota 10/min per student then refused; other students unaffected; non-GISMA and suspended refused; cache/quota RPCs not callable by `anon`/`authenticated`; `private.external_cache` unreadable by clients; provider and query cache isolation; expired entries not served; TTL < 60 s refused. | All passed. |

No vacancy counts, titles or URLs can be reported because no live provider call happened.

## D. Tests run on this branch

- Deno: `deno check` (3 functions) clean; `_shared`, `delete-account`, `external-data`, `stuora-assistant` **28/28**; photo, group-file suites 12/10/3/6/8 pass.
- `npm run test:database` (PGlite): **21/21**, including the staged-migration rollback test with the new migration.
- `npm run typecheck`, `check:environment`, `export:web`, secret scan (326 files clean), photo-session-cache 8/8, branding/TestFlight guards.
- Playwright full suite (desktop + mobile-web): **198 passed, 12 skipped** (feed specs skip without the flag); external-feed spec with feeds enabled: **8/8**.
- Staging, rollback-only: Jobs lifecycle 38 checks; J-DB migration dry run 6/6; staging verified unchanged afterwards.

## E. External blockers (not code)

1. **Licensed job data.** Adzuna licence agreement, or written BA permission, or another provider whose terms allow display in a student product (e.g. Arbeitnow's free public API asks for attribution — needs its terms reviewed and a new adapter, which is new scope requiring approval).
2. **Deploying** the patched `external-data` and **applying** `20261125090000` to staging both need your explicit approval.
3. **A staging moderator** and **two real GISMA test students** for UI-level moderation and application acceptance.
4. **Physical Android and iOS runs** of the Jobs journey.
