#!/usr/bin/env node
// Gismate Location Engine: build a versioned GeoNames import.
//
//   node scripts/geonames/build-import.mjs <input-dir> <output-dir> [version]
//
// <input-dir> must hold the OFFICIAL GeoNames dump files, unmodified:
//   DE.txt (unzipped from https://download.geonames.org/export/dump/DE.zip)
//   admin1CodesASCII.txt, admin2Codes.txt (same directory on the server)
//   DE.zip (kept only to record its checksum)
//
// Output: manifest.json (version, source files, SHA-256, licence, row counts)
// and SQL chunks 0000-begin.sql … NNNN-rows.sql … 9999-activate.sql, each
// under ~1.4 MB, to be run IN ORDER against the target database. Nothing here
// connects to a database. Same inputs → byte-identical outputs.
//
// Data: GeoNames (https://www.geonames.org/), Creative Commons Attribution 4.0.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const LICENCE = 'CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)';
export const ATTRIBUTION = 'City data © GeoNames (geonames.org), CC BY 4.0';
const SOURCE = 'https://download.geonames.org/export/dump/';
const COUNTRY = { DE: 'Germany' };
// Populated places a student can live or study in. Excluded: PPLX (section of
// a place), PPLH (historical), PPLQ (abandoned), PPLW (destroyed), PPLCH.
export const KEEP_CODES = new Set(['PPL', 'PPLA', 'PPLA2', 'PPLA3', 'PPLA4', 'PPLA5', 'PPLC', 'PPLF', 'PPLG', 'PPLL', 'PPLR', 'PPLS']);
const CHUNK_BYTES = 1_400_000;

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

export function buildRows(deTxt, admin1Txt, admin2Txt) {
  const admin1 = new Map(), admin2 = new Map();
  for (const line of admin1Txt.split('\n')) { const c = line.split('\t'); if (c.length >= 2 && c[0].startsWith('DE.')) admin1.set(c[0], c[1]); }
  for (const line of admin2Txt.split('\n')) { const c = line.split('\t'); if (c.length >= 2 && c[0].startsWith('DE.')) admin2.set(c[0], c[1]); }
  const places = [], names = [];
  for (const line of deTxt.split('\n')) {
    const c = line.split('\t');
    if (c.length < 19 || c[6] !== 'P' || !KEEP_CODES.has(c[7]) || !COUNTRY[c[8]]) continue;
    const id = Number(c[0]);
    if (!Number.isInteger(id) || !c[1]) continue;
    const place = {
      id, name: c[1], ascii: c[2], featureCode: c[7], countryCode: c[8], countryName: COUNTRY[c[8]],
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
    if (place.ascii) add(place.ascii, true);
    for (const alt of c[3] ? c[3].split(',') : []) if (usefulAlternate(alt)) add(alt, false);
    for (const [key, primary] of [...keys].sort((a, b) => a[0].localeCompare(b[0]))) names.push({ id, key, primary });
  }
  places.sort((a, b) => a.id - b.id);
  names.sort((a, b) => a.id - b.id || a.key.localeCompare(b.key));
  return { places, names };
}

export function buildChunks(version, places, names) {
  const v = sql(version);
  const statements = [];
  for (let i = 0; i < places.length; i += 400) {
    statements.push('insert into private.geo_places (dataset_version, geonameid, name, ascii_name, admin1_name, admin2_name, country_code, country_name, latitude, longitude, population, feature_code) values\n' +
      places.slice(i, i + 400).map(p => `(${v},${p.id},${sql(p.name)},${sql(p.ascii)},${sql(p.admin1)},${sql(p.admin2)},${sql(p.countryCode)},${sql(p.countryName)},${p.lat},${p.lon},${p.population},${sql(p.featureCode)})`).join(',\n') + ';');
  }
  for (let i = 0; i < names.length; i += 1500) {
    statements.push('insert into private.geo_place_names (dataset_version, geonameid, name_key, is_primary) values\n' +
      names.slice(i, i + 1500).map(n => `(${v},${n.id},${sql(n.key)},${n.primary})`).join(',\n') + ';');
  }
  const chunks = [];
  let current = '';
  for (const s of statements) {
    if (current && current.length + s.length > CHUNK_BYTES) { chunks.push(current); current = ''; }
    current += s + '\n';
  }
  if (current) chunks.push(current);
  return chunks;
}

function sha256(buf) { return createHash('sha256').update(buf).digest('hex'); }

function main() {
  const [inDir, outDir, versionArg] = process.argv.slice(2);
  if (!inDir || !outDir) { console.error('usage: build-import.mjs <input-dir> <output-dir> [version]'); process.exit(2); }
  const files = {};
  for (const name of ['DE.zip', 'DE.txt', 'admin1CodesASCII.txt', 'admin2Codes.txt']) {
    const buf = readFileSync(join(inDir, name));
    files[name] = { url: name === 'DE.txt' ? `${SOURCE}DE.zip (unzipped)` : SOURCE + name, bytes: buf.length, sha256: sha256(buf) };
  }
  // Version = dataset content, not the clock: same inputs give the same version.
  const version = versionArg || `geonames-de-${files['DE.txt'].sha256.slice(0, 12)}`;
  if (!/^[a-z0-9-]{8,64}$/.test(version)) throw new Error('version must be 8-64 of [a-z0-9-]');
  const { places, names } = buildRows(readFileSync(join(inDir, 'DE.txt'), 'utf8'),
    readFileSync(join(inDir, 'admin1CodesASCII.txt'), 'utf8'), readFileSync(join(inDir, 'admin2Codes.txt'), 'utf8'));
  if (places.length < 10_000) throw new Error(`only ${places.length} places: refusing a truncated dataset`);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const manifest = {
    version, source: SOURCE, licence: LICENCE, attribution: ATTRIBUTION, country: 'DE',
    featureCodes: [...KEEP_CODES].sort(), files, places: places.length, names: names.length,
  };
  const v = sql(version);
  const begin = `-- ${version}: register the dataset (inactive) and clear any half-loaded copy.\n` +
    `delete from private.geo_place_names where dataset_version = ${v};\ndelete from private.geo_places where dataset_version = ${v};\n` +
    `delete from private.geo_datasets where version = ${v};\n` +
    `insert into private.geo_datasets (version, source, licence, attribution, manifest, expected_places, expected_names) values (${v}, ${sql(SOURCE)}, ${sql(LICENCE)}, ${sql(ATTRIBUTION)}, ${sql(JSON.stringify(manifest))}::jsonb, ${places.length}, ${names.length});\n`;
  const chunks = buildChunks(version, places, names);
  const activate = `-- Activate only if every row arrived; otherwise this raises and nothing changes.\nselect private.geo_activate_dataset(${v});\n`;
  writeFileSync(join(outDir, '0000-begin.sql'), begin);
  chunks.forEach((c, i) => writeFileSync(join(outDir, `${String(i + 1).padStart(4, '0')}-rows.sql`), c));
  writeFileSync(join(outDir, '9999-activate.sql'), activate);
  manifest.chunks = readdirSync(outDir).filter(f => f.endsWith('.sql')).sort()
    .map(f => ({ file: f, sha256: sha256(readFileSync(join(outDir, f))) }));
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify({ version, places: places.length, names: names.length, chunks: chunks.length }));
}

if (import.meta.url === `file://${process.argv[1]}`) main();
