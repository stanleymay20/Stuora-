# Gismate Location Engine

City lookup from openly licensed GeoNames data held in Stuora's own Supabase
database. It replaces calls to the public OpenStreetMap servers: on 26 Nov 2026
both Nominatim and Photon answered the `external-data` Edge Function with HTTP 403,
so no student could check a new city on staging.

## How a lookup flows

1. The app calls `external-data` with `{ "action": "city", "query": "…" }` (unchanged
   request; web, Android and iOS use the same call).
2. The function checks the JWT, the confirmed-GISMA rule (`require_external_student`)
   and the per-student quota (`consume_external_data_request`), exactly as before.
3. It calls `public.geo_city_search(query)`: executable by `service_role` only, so
   clients cannot query the data directly.
4. If GeoNames has matches they are returned with GeoNames attribution. Only when it
   has none (e.g. a city outside Germany) does the function try OpenStreetMap; if
   OpenStreetMap is down, the student gets an honest empty answer, not an error.

Response compatibility: every candidate keeps `name`, `region`, `country`,
`countryCode` (what all app versions render). New optional fields: `district`,
`latitude`, `longitude`, `population`, `geonameId`. Same-named places in one state
get their district in `region`, so older apps still show distinct rows.

## Search behaviour

- Spelling folding both ways: `München` = `Munchen` = `Muenchen`; `ß` → `ss`; accents
  and punctuation ignored (`frankfurt oder` finds `Frankfurt (Oder)`).
- German display names from GeoNames' alternate-name table (`München`, `Köln`,
  `Nürnberg`); English and other Latin-script names still match (`Munich`).
- Exact matches before prefix matches (`Pots` → Potsdam); within each, larger places
  first, so cities beat hamlets that share their name. At most 10 results.
- Populated places only (GeoNames class P); sections, historical, abandoned and
  destroyed places are excluded.

## Data source and licence

GeoNames (https://www.geonames.org/), Creative Commons Attribution 4.0
(stated in https://download.geonames.org/export/dump/readme.txt). The app shows
"City data © GeoNames (CC BY 4.0)" under every GeoNames result, linking to
geonames.org. Files used: `DE.zip`, `admin1CodesASCII.txt`, `admin2Codes.txt`,
`alternatenames/DE.zip`.

## Import pipeline (reproducible, versioned)

`.github/workflows/geonames-import.yml` (on push to `feature/location-engine-*`, or
manually) downloads the official files, checks the CC BY 4.0 statement, unit-tests
`scripts/geonames/build-import.mjs`, builds the dataset **twice and diffs it**, then
publishes to the `geonames-data` branch under `<version>/`:

| File | Purpose |
| --- | --- |
| `places.tsv`, `names.tsv` | Plain data, one row per place / searchable name |
| `begin.sql` | Registers the version, inactive |
| `activate.sql` | Activates it only if every row arrived |
| `manifest.json` | Source URLs, SHA-256 of every input and output, licence, counts |
| `SOURCE-SHA256SUMS` | Checksums of the downloaded files |

The version name is derived from the input checksums, so the same GeoNames files
always give the same version. The workflow never connects to a database.

## Loading a version

Requires migration `20261126090000_gismate_location_engine.sql`.

With `psql`, from a checkout of the `geonames-data` branch:

```
psql "$DB" -f <version>/begin.sql
psql "$DB" -v v=<version> <<'SQL'
\set places `cat <version>/places.tsv`
select private.geo_load_tsv(:'v', 'places.tsv', :'places');
\set names `cat <version>/names.tsv`
select private.geo_load_tsv(:'v', 'names.tsv', :'names');
SQL
psql "$DB" -f <version>/activate.sql
```

Without a file system (how staging was loaded): run `begin.sql`, then
`private.geo_load_tsv(version, 'places.tsv', body)` and the same for `names.tsv`.
The loader refuses a body whose SHA-256 differs from the manifest and parses it as
data only; it never executes it. Then run `activate.sql`. Activation fails unless
the row counts match the manifest; the previous version is kept for rollback.

Rollback to the previous version: `select private.geo_activate_dataset('<previous>')`.
Remove everything: `supabase/rollback/20261126090000_gismate_location_engine.down.sql`.

## Geoapify as an optional fallback (evaluated, not enabled)

Reviewed 26 Nov 2026 from Geoapify's pricing page and privacy policy:

- Free plan: 3,000 credits/day, 5 requests/s; a geocoding request costs 1 credit.
  Commercial production use is allowed on the free plan.
- Attribution: "Powered by Geoapify" plus data-source (OpenStreetMap) attribution.
- Privacy: EU business under the GDPR, EU data centres; each request's body,
  headers, IP and timestamp are kept, generally no longer than 24 hours. A DPA is
  published. Only the typed city name and the Edge Function's IP would be sent:
  no student identifiers.

Recommendation: not needed while GeoNames covers Germany. Worth adding only for
cities outside Germany, behind its own flag, after a signed DPA and a privacy-notice
update. No account was created and no key was added.

## Known limits

- Germany only. Non-German cities fall back to OpenStreetMap, which currently
  refuses Supabase traffic, so they return no candidates.
- Students can still save a typed city without checking it; the check is advisory.
- Feeds use the saved city name; Ticketmaster matches by city name, not coordinates.
