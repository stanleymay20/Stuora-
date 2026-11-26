#!/usr/bin/env node
// Gismate Location Engine: build a versioned GeoNames import.
//
//   node scripts/geonames/build-import.mjs <input-dir> <output-dir> [version] [countries]
//
// countries: comma-separated ISO codes, default DE,AT,CH (Germany, Austria,
// Switzerland). <input-dir> must hold the OFFICIAL GeoNames dump files, unmodified,
// for each country CC:
//   CC.txt (unzipped from https://download.geonames.org/export/dump/CC.zip)
//   CC.zip (kept only to record its checksum)
//   alternateNames-CC.txt (from alternatenames/CC.zip): per-language names,
//     used so places show their German name ("München", "Wien", not "Munich", "Vienna")
// and once: admin1CodesASCII.txt, admin2Codes.txt (same directory on the server).
//
// Output (nothing here connects to a database; same inputs → identical bytes):
//   places.tsv, names.tsv  plain data, loaded by private.geo_load_tsv() or psql \copy
//   begin.sql              registers the dataset version (inactive)
//   activate.sql           activates it only if every row arrived
//   manifest.json          version, source files + SHA-256, licence, counts, output hashes
// Loading steps: docs/GISMATE_LOCATION_ENGINE.md.
//
// Data: GeoNames (https://www.geonames.org/), Creative Commons Attribution 4.0.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LICENCE = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
export const ATTRIBUTION = 'City data © GeoNames (geonames.org), CC BY 4.0';
const SOURCE = 'https://download.geonames.org/export/dump/';
export const COUNTRY = { DE: 'Germany', AT: 'Austria', CH: 'Switzerland' };
// Populated places a student can live or study in. Excluded: PPLX (section of
// a place), PPLH (historical), PPLQ (abandoned), PPLW (destroyed), PPLCH.
export const KEEP_CODES = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLF', 'PPLG', 'PPLL', 'PPLR', 'PPLS']);

/** Same folding as private.geo_fold() in SQL; keep the two in step (tested). */
export function fold(value, transliterate = false) {
  let v = value.normalize('NFC').toLowerCase();
  if (transliterate) v = v.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
  v = v.replace(/ß/g, 'ss').replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o').replace(/ł/g, 'l').replace(/đ/g, 'd');
  v = v.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return v.replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Latin-script alternate names a student might type; others are dropped. */
function usefulAlternate(name) {
  return name.length >= 2 && name.length <= 80 && /^[\p{Script=Latin}0-9 .,'’()\-/]+$/u.test(name) && /\p{L}/u.test(name);
}

const sql = v => v === null || v === undefined ? 'null' : `'${String(v).replace(/'/g, "''")}'`;

/**
 * German display name per place from the alternate-names table
 * (alternateNameId, geonameid, isolanguage, name, isPreferredName, isShortName,
 * isColloquial, isHistoric, from, to). Preferred, non-short, current names win.
 */
export function germanNames(altTxt) {
  const best = new Map(), all = new Map();
  for (const line of (altTxt ?? '').split('\n')) {
    const c = line.split('\t');
    if (c.length < 8 || c[2] !== 'de' || !c[3] || c[6] === '1' || c[7] === '1' || (c[9] && c[9].trim())) continue;
    const id = Number(c[1]);
    const rank = (c[4] === '1' ? 2 : 0) + (c[5] === '1' ? 0 : 1);
    if (!all.has(id)) all.set(id, []);
    all.get(id).push(c[3]);
    const cur = best.get(id);
    if (!cur || rank > cur.rank) best.set(id, { name: c[3], rank });
  }
  return { display: new Map([...best].map(([id, v]) => [id, v.name])), all };
}

/** `placesTxt` / `altTxt`: one or more countries' dump files, concatenated. */
export function buildRows(placesTxt, admin1Txt, admin2Txt, altTxt = '') {
  const german = germanNames(altTxt);
  const admin1 = new Map(), admin2 = new Map();
  for (const line of admin1Txt.split('\n')) { const c = line.split('\t'); if (c.length >= 2 && COUNTRY[c[0].slice(0, 2)] && c[0][2] === '.') admin1.set(c[0], c[1].replace(/^(Land|State of|Canton of) /, '')); }
  for (const line of admin2Txt.split('\n')) { const c = line.split('\t'); if (c.length >= 2 && COUNTRY[c[0].slice(0, 2)] && c[0][2] === '.') admin2.set(c[0], c[1]); }
  const places = [], names = [];
  for (const line of placesTxt.split('\n')) {
    const c = line.split('\t');
    if (c.length < 19 || c[6] !== 'P' || !KEEP_CODES.has(c[7]) || !COUNTRY[c[8]]) continue;
    const id = Number(c[0]);
    if (!Number.isInteger(id) || !c[1]) continue;
    const officialName = c[1];
    const place = {
      id, name: german.display.get(id) ?? officialName, ascii: c[2], featureCode: c[7], countryCode: c[8], countryName: COUNTRY[c[8]],
      admin1: admin1.get(`${c[8]}.${c[10]}`) ?? null,
      admin2: admin2.get(`${c[8]}.${c[10]}.${c[11]}`) ?? null,
      lat: Number(c[4]).toFixed(5), lon: Number(c[5]).toFixed(5), population: Number(c[14]) || 0,
    };
    places.push(place);
    const keys = new Map(); // key -> is_primary
    const add = (n, primary) => {
      for (const k of [fold(n), fold(n, true)]) if (k.length >= 2 && (!keys.has(k) || primary)) keys.set(k, primary || keys.get(k) === true);
    };
    add(place.name, true);
    add(officialName, true);
    if (place.ascii) add(place.ascii, true);
    for (const de of german.all.get(id) ?? []) if (usefulAlternate(de)) add(de, true);
    for (const alt of c[3] ? c[3].split(',') : []) if (usefulAlternate(alt)) add(alt, false);
    for (const [key, primary] of [...keys].sort((a, b) => a[0].localeCompare(b[0]))) names.push({ id, key, primary });
  }
  places.sort((a, b) => a.id - b.id);
  names.sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));
  return { places, names };
}

const cell = v => v === null || v === undefined ? '' : String(v);

/** Tab-separated, newline-terminated; GeoNames names never contain tabs or newlines. */
export function buildTsv(places, names) {
  for (const p of places) for (const v of [p.name, p.ascii, p.admin1, p.admin2]) if (/[\t\n\r]/.test(cell(v))) throw new Error(`control character in ${p.id}`);
  const placesTsv = places.map(p => [p.id, p.name, cell(p.ascii), cell(p.admin1), cell(p.admin2), p.countryCode, p.countryName,
    p.lat, p.lon, p.population, p.featureCode].join('\t') + '\n').join('');
  const namesTsv = names.map(n => `${n.id}\t${n.key}\t${n.primary ? 't' : 'f'}\n`).join('');
  return { placesTsv, namesTsv };
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function main() {
  const [inDir, outDir, versionArg, countriesArg] = process.argv.slice(2);
  if (!inDir || !outDir) { console.error('usage: build-import.mjs <input-dir> <output-dir> [version] [countries]'); process.exit(2); }
  const countries = (countriesArg || 'DE,AT,CH').split(',').map(c => c.trim().toUpperCase());
  for (const c of countries) if (!COUNTRY[c]) throw new Error(`unsupported country ${c}`);
  const files = {};
  const urls = { 'admin1CodesASCII.txt': `${SOURCE}admin1CodesASCII.txt`, 'admin2Codes.txt': `${SOURCE}admin2Codes.txt` };
  for (const c of countries) Object.assign(urls, { [`${c}.zip`]: `${SOURCE}${c}.zip`, [`${c}.txt`]: `${SOURCE}${c}.zip (unzipped)`,
    [`alternateNames-${c}.txt`]: `${SOURCE}alternatenames/${c}.zip (unzipped ${c}.txt)` });
  for (const name of Object.keys(urls)) {
    const buf = readFileSync(join(inDir, name));
    files[name] = { url: urls[name], bytes: buf.length, sha256: sha256(buf) };
  }
  // Version = dataset content, not the clock: same inputs give the same version.
  const inputs = Object.keys(files).filter(n => !n.endsWith('.zip')).sort().map(n => files[n].sha256).join('');
  const prefix = countries.length === 1 ? `geonames-${countries[0].toLowerCase()}` : 'geonames-dach';
  const version = versionArg || `${prefix}-${createHash('sha256').update(countries.join(',') + inputs).digest('hex').slice(0, 12)}`;
  if (!/^[a-z0-9-]{8,64}$/.test(version)) throw new Error('version must be 8-64 of [a-z0-9-]');
  const read = n => readFileSync(join(inDir, n), 'utf8');
  const joinFiles = names => names.map(n => { const t = read(n); return t.endsWith('\n') ? t : t + '\n'; }).join('');
  const { places, names } = buildRows(joinFiles(countries.map(c => `${c}.txt`)), read('admin1CodesASCII.txt'), read('admin2Codes.txt'),
    joinFiles(countries.map(c => `alternateNames-${c}.txt`)));
  const perCountry = Object.fromEntries(countries.map(c => [c, places.filter(p => p.countryCode === c).length]));
  for (const [c, n] of Object.entries(perCountry)) if (n < 1_000) throw new Error(`only ${n} places for ${c}: refusing a truncated dataset`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const manifest = {
    version, source: SOURCE, licence: LICENCE, attribution: ATTRIBUTION, countries, placesPerCountry: perCountry,
    featureCodes: [...KEEP_CODES].sort(), files, places: places.length, names: names.length,
  };
  const { placesTsv, namesTsv } = buildTsv(places, names);
  const v = sql(version);
  writeFileSync(join(outDir, 'places.tsv'), placesTsv);
  writeFileSync(join(outDir, 'names.tsv'), namesTsv);
  manifest.outputs = { 'places.tsv': sha256(Buffer.from(placesTsv)), 'names.tsv': sha256(Buffer.from(namesTsv)) };
  const begin = `-- ${version}: register the dataset (inactive) and clear any half-loaded copy.\n` +
    `delete from private.geo_datasets where version = ${v} and not active;\n` +
    `insert into private.geo_datasets (version, source, licence, attribution, manifest, expected_places, expected_names) values (${v}, ${sql(SOURCE)}, ${sql(LICENCE)}, ${sql(ATTRIBUTION)}, ${sql(JSON.stringify({ ...manifest }))}::jsonb, ${places.length}, ${names.length});\n`;
  writeFileSync(join(outDir, 'begin.sql'), begin);
  writeFileSync(join(outDir, 'activate.sql'), `-- Activates only if every row arrived; otherwise raises and nothing changes.\nselect private.geo_activate_dataset(${v});\n`);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ version, places: places.length, perCountry, names: names.length, outputs: manifest.outputs }));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
