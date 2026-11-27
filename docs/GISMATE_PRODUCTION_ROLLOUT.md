# Gismate Location Engine: production rollout pack

Status: **prepared, not run.** Nothing here has touched production. Every step
below needs Stanley's explicit approval at the time it is run. Staging ran the
same steps on 26 Nov 2026 (evidence at the end).

Scope: PR #47 (city lookup from GeoNames, feeds by position, Adzuna label), which
is stacked on PR #46 (Jobs API integrity). Both PRs target feature branches. Trace their parent PRs through to `main` and verify that the reviewed changes are present on `main` before building or deploying.

## 0. Go / no-go before starting

| Check | How | Must be |
| --- | --- | --- |
| PR #46 and #47 reviewed and merged | GitHub | merged, CI green on the merge commit |
| Production project ref known | Supabase dashboard | written here before step 1: `__________` |
| Production migration history matches the repo up to PR #46's base | Migration history on the verified production project | no unknown or missing migrations |
| Backup point | Dashboard → Database → Backups (or PITR timestamp) | a verified restore point less than 24 hours old noted: `__________` |
| Groq inference API zero data retention | Groq console → Data Controls | **Enabled** (separate blocker, but launch-blocking) |
| Device test script passed | [DEVICE_TEST_SCRIPT.md](DEVICE_TEST_SCRIPT.md) | one Android + one iPhone, signed |

If any row is not met, stop. Nothing below is partly useful on its own.

## 1. Migrations (in this order)

1. `20261125090000_job_application_integrity.sql` (PR #46), only if not already applied
2. `20261126090000_gismate_location_engine.sql`
3. `20261126120000_geo_city_search_exact.sql`
4. `20261127090000_student_partner_offers.sql` (PR #49), if the 0.1.7 release ships Student Savings partner offers. **Not yet applied on staging** (27 Nov); apply and test there first.

The complete 0.1.7 release adds about 40 migrations relative to `main` (see PR #48). Reconcile the whole list against production history before step 1; the four above are only those added by #46, #47 and #49. Feature inventory and go/no-go: [RELEASE_CANDIDATE_0.1.7.md](RELEASE_CANDIDATE_0.1.7.md).

```
supabase link --project-ref "$PROD_PROJECT_REF"
supabase migration list --linked
supabase db push --linked --dry-run
```

Compare the dry run with the pending migrations listed above. Stop on any discrepancy. After approval, apply the reviewed plan from the same checkout.

```sh
supabase db push --linked
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

**Load from the pinned checkout with Python 3 and psycopg 3.** Set `PROD_DB` to the verified production connection. The loader preserves the exact UTF-8 bytes, including the trailing newline. Registration, both loads and activation commit together.

```sh
set -eu
git fetch origin geonames-data
git worktree add --detach /tmp/geo 60e0338905670e437c9d0ebe8326e11cd3274ac0
cd /tmp/geo/geonames-dach-12ec671b485f
python3 -c 'import psycopg' 2>/dev/null || python3 -m pip install --user "psycopg[binary]>=3.1"
python3 - <<'PY'
import hashlib
import os
from pathlib import Path

import psycopg

version = "geonames-dach-12ec671b485f"
hashes = {
    "places.tsv": "be10094238abea5ceb836182561fe0ca30ec4ce08364e6c24df632f98dd53a2e",
    "names.tsv": "8259ff7316b26c23e0ce58fd12d767891cfacc21683c5f8fc1435cabb9fea684",
}
with psycopg.connect(os.environ["PROD_DB"]) as conn:
    conn.execute(Path("begin.sql").read_text(encoding="utf-8"))
    for name, digest in hashes.items():
        raw = Path(name).read_bytes()
        if hashlib.sha256(raw).hexdigest() != digest:
            raise ValueError(f"Checksum mismatch for {name}")
        conn.execute("select private.geo_load_tsv(%s, %s, %s)",
                     (version, name, raw.decode("utf-8")))
    conn.execute(Path("activate.sql").read_text(encoding="utf-8"))
PY
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
- Signed-in PR #47 preview at `12dfd39`: Wien and Zürich ranked first and returned local Ticketmaster venues. Paris suggested Parisdorf; retaining the typed city produced an empty Paris feed. All three lookups displayed GeoNames attribution. The provider adapter uses the configured country (default DE) for name-only queries, so this test does not establish French event coverage.
- Groq Inference APIs ZDR was enabled and verified for the organization containing the Stuora key. Physical-device sign-off and production verification remain pending.
