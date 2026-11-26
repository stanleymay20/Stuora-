# Gismate Location Engine: production rollout pack

Status: **prepared, not run.** Nothing here has touched production. Every step
below needs Stanley's explicit approval at the time it is run. Staging ran the
same steps on 26 Nov 2026 (evidence at the end).

Scope: PR #47 (city lookup from GeoNames, feeds by position, Adzuna label), which
is stacked on PR #46 (Jobs API integrity). Merge #46 first, then #47.

## 0. Go / no-go before starting

| Check | How | Must be |
| --- | --- | --- |
| PR #46 and #47 reviewed and merged | GitHub | merged, CI green on the merge commit |
| Production project ref known | Supabase dashboard | written here before step 1: `__________` |
| Production migration history matches the repo up to PR #46's base | `supabase migration list --project-ref <prod>` (or `list_migrations`) | no unknown or missing migrations |
| Backup point | Dashboard → Database → Backups (or PITR timestamp) | a backup newer than today noted: `__________` |
| Groq zero data retention | Groq console → Data Controls | **Enabled** (separate blocker, but launch-blocking) |
| Device test script passed | [DEVICE_TEST_SCRIPT.md](DEVICE_TEST_SCRIPT.md) | one Android + one iPhone, signed |

If any row is not met, stop. Nothing below is partly useful on its own.

## 1. Migrations (in this order)

1. `20261125090000_job_application_integrity.sql` (PR #46), only if not already applied
2. `20261126090000_gismate_location_engine.sql`
3. `20261126120000_geo_city_search_exact.sql`

```
supabase db push --project-ref <prod>        # applies exactly the files above if history matched in step 0
```

Verify:

```sql
select proname, proacl from pg_proc where proname in ('geo_city_search','geo_load_tsv','geo_activate_dataset');
-- geo_city_search: execute for service_role only (no anon, no authenticated)
select count(*) from private.geo_datasets;   -- 0 (no data yet)
```

Effect if stopped here: none for students. With no active dataset,
`geo_city_search` returns `[]` and the function falls back to OpenStreetMap as it
does today.

## 2. Load the dataset

Dataset: `geonames-dach-12ec671b485f` (Germany 77,409 + Austria 20,066 + Switzerland
11,413 = 108,888 places, 168,538 names), commit `60e0338905670e437c9d0ebe8326e11cd3274ac0`
on the `geonames-data` branch. Expected output hashes (from the CI build log):

- `places.tsv` `be10094238abea5ceb836182561fe0ca30ec4ce08364e6c24df632f98dd53a2e`
- `names.tsv` `8259ff7316b26c23e0ce58fd12d767891cfacc21683c5f8fc1435cabb9fea684`

**Preferred: psql from a checkout** (no extension added to production):

```
git fetch origin geonames-data && git worktree add /tmp/geo 60e0338905670e437c9d0ebe8326e11cd3274ac0
cd /tmp/geo/geonames-dach-12ec671b485f
sha256sum places.tsv names.tsv              # must equal the two hashes above
psql "$PROD_DB" -f begin.sql
psql "$PROD_DB" -v v=geonames-dach-12ec671b485f <<'SQL'
\set places `cat places.tsv`
select private.geo_load_tsv(:'v', 'places.tsv', :'places');
\set names `cat names.tsv`
select private.geo_load_tsv(:'v', 'names.tsv', :'names');
SQL
psql "$PROD_DB" -f activate.sql
```

`geo_load_tsv` refuses any body whose SHA-256 differs from the manifest, and
`activate.sql` refuses unless every row arrived. A failure at any point leaves the
dataset inactive and students on the old behaviour.

**Alternative (how staging was loaded):** one transaction that installs the `http`
extension, fetches the three files from the pinned commit, loads, activates and
drops the extension. The exact SQL is in the PR #47 staging log; use it only if
psql is not available, because it briefly adds an extension to production.

## 3. Verify the data (read-only)

```sql
select q, r->0->>'name' top, r->0->>'region' region, r->0->>'countryCode' cc, r->0->>'exact' exact
from unnest(array['Berlin','Potsdam','Brandenburg an der Havel','Halberstadt','München','Munich',
  'Frankfurt am Main','Frankfurt (Oder)','Frankfurt','Wien','Zürich','Genève','Paris','Pots']) q,
 lateral (select public.geo_city_search(q) r) s;
```

Expected (identical to staging):

| Query | Top | Region | CC | Exact |
| --- | --- | --- | --- | --- |
| Berlin | Berlin | Berlin | DE | true |
| Potsdam | Potsdam | Brandenburg | DE | true |
| Brandenburg an der Havel | Brandenburg an der Havel | Brandenburg | DE | true |
| Halberstadt | Halberstadt | Saxony-Anhalt | DE | true |
| München | München | Bavaria · Upper Bavaria (hamlets of the same name exist in Bavaria) | DE | true |
| Munich | München | Bavaria | DE | true |
| Frankfurt am Main | Frankfurt am Main | Hesse | DE | true |
| Frankfurt (Oder) | Frankfurt (Oder) | Brandenburg | DE | true |
| Frankfurt | Frankfurt am Main (both listed) | Hesse | DE | true |
| Wien | Wien | Vienna | AT | true |
| Zürich | Zürich | Zurich | CH | true |
| Genève | Genf | Geneva | CH | true |
| Paris | Parisdorf | Lower Austria | AT | **false** (feeds search by name) |
| Pots | Potsdam | Brandenburg | DE | false |

Any difference: stop and roll back the data (section 6).

## 4. Deploy the function

From the merged `main` (never from a branch):

```
supabase functions deploy external-data --project-ref <prod>
```

Production secrets this needs (check names only, never print values):

- `TICKETMASTER_API_KEY` set
- `STUORA_ALLOWED_WEB_ORIGINS` = the production web origin(s) only, no wildcards
- `ADZUNA_COMMERCIAL_LICENSE` and `BA_JOBSUCHE_ENABLED` **not** set (jobs stay off until licensed)

## 5. Smoke tests (signed-in GISMA test account, production app)

1. City chip → "Munich" → Check → München (Bavaria) listed first; footer says
   "City data © GeoNames (CC BY 4.0)".
2. Pick it → header shows München → Events shows events (Ticketmaster labels them "Munich").
3. City "Wien" → Events: Austrian events or an honest empty state, never German ones.
4. Jobs → "External jobs aren't enabled yet".
5. Signed out → city lookup asks you to sign in.

## 6. Rollback

| Problem | Action | Time |
| --- | --- | --- |
| Wrong search results | `select private.geo_activate_dataset('<previous version>')`; on a first load there is none, so instead `update private.geo_datasets set active = false;` (search returns `[]`, OSM fallback) | < 1 min |
| Function misbehaves | Redeploy the previous version from the commit before the merge: `git checkout <prev> && supabase functions deploy external-data --project-ref <prod>` | ~2 min |
| Remove everything | `supabase/rollback/20261126120000_geo_city_search_exact.down.sql`, then `20261126090000_gismate_location_engine.down.sql` | ~1 min |

Event feed cache entries live 30 minutes; after a rollback, old results can show
for up to that long.

## Staging evidence (26 Nov 2026)

- Migrations applied: `gismate_location_engine`, `geo_city_search_exact`.
- Dataset `geonames-dach-12ec671b485f` active at 06:41 UTC; `geonames-de-e349e99a43a8`
  kept for rollback; `http` extension removed (verified: 0 rows in `pg_extension`).
- Section 3 query: every row as in the table above.
- `external-data` v23 deployed. Signed-in live check of v23 **still to run** (the
  browser was unavailable); v22 passed the same city and feed checks for Germany.
