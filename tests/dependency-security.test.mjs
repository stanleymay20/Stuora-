import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { auditProduction, validateAudit } from '../scripts/audit-production.mjs';
const baseline = JSON.parse(readFileSync(new URL('../security/production-audit-baseline.json', import.meta.url)));
const report = () => structuredClone(baseline);
function recount(r) {
  const m = r.metadata.vulnerabilities;
  for (const key of Object.keys(m)) m[key] = 0;
  for (const v of Object.values(r.vulnerabilities)) { m[v.severity]++; m.total++; }
  return r;
}
test('accepts controlled findings, fewer paths and complete/partial remediation', () => {
  assert.equal(validateAudit(report(), 1), 22);
  const clean = report(); clean.vulnerabilities = {};
  assert.equal(validateAudit(recount(clean), 0), 0);
  const reduced = report(); delete reduced.vulnerabilities['@expo/cli'];
  reduced.vulnerabilities.expo.via = reduced.vulnerabilities.expo.via.filter(v => v !== '@expo/cli');
  assert.equal(validateAudit(recount(reduced), 1), 21);
  const lower = report(); lower.vulnerabilities.braces.severity = 'moderate';
  lower.vulnerabilities.braces.via[0].severity = 'moderate';
  assert.equal(validateAudit(recount(lower), 1), 22);
});
const cases = {
  'missing data': r => { delete r.vulnerabilities; },
  'registry error': r => { r.error = { code: 'E503' }; },
  'unsupported schema': r => { r.auditReportVersion = 3; },
  'missing metadata': r => { delete r.metadata; },
  'inconsistent counts': r => { r.metadata.vulnerabilities.total--; },
  'hidden critical count': r => { r.metadata.vulnerabilities.critical = 1; },
  'critical package': r => { r.vulnerabilities.uuid.severity = 'critical'; recount(r); },
  'severity escalation': r => { r.vulnerabilities.uuid.severity = 'high'; recount(r); },
  'new package with unchanged total': r => { r.vulnerabilities.evil = r.vulnerabilities.uuid; delete r.vulnerabilities.uuid; },
  'new path': r => { r.vulnerabilities.uuid.nodes.push('node_modules/evil/node_modules/uuid'); },
  'missing paths': r => { r.vulnerabilities.uuid.nodes = []; },
  'changed direct exposure': r => { r.vulnerabilities.uuid.isDirect = true; },
  'new advisory': r => { r.vulnerabilities.uuid.via[0].url = 'https://github.com/advisories/NEW'; },
  'wrong advisory package': r => { r.vulnerabilities.uuid.via = r.vulnerabilities.braces.via; },
  'new advisory source': r => { r.vulnerabilities.uuid.via[0].source++; },
  'worsened CVSS': r => { r.vulnerabilities.uuid.via[0].cvss.score = 9; },
  'missing advisory URL': r => { delete r.vulnerabilities.uuid.via[0].url; },
  'empty via': r => { r.vulnerabilities.uuid.via = []; },
  'malformed via': r => { r.vulnerabilities.uuid.via = [null]; },
  'dangling via': r => { delete r.vulnerabilities.uuid; recount(r); },
  'rootless cycle': r => { r.vulnerabilities['@expo/metro'].via = ['metro-config']; r.vulnerabilities.metro.via = ['metro-config']; },
};
for (const [name, mutate] of Object.entries(cases)) test(`rejects ${name}`, () => {
  const r = report(); mutate(r); assert.throws(() => validateAudit(r, 1));
});
test('rejects process failures, invalid JSON and exit status mismatch', () => {
  for (const result of [
    {status: 2, stdout: JSON.stringify(report())},
    {status: 0, stdout: JSON.stringify(report())},
    {status: 1, stdout: '{}'}, {status: 1, stdout: 'broken'},
    {status: null, stdout: '', error: new Error('spawn failure')},
    {status: null, stdout: JSON.stringify(report()), signal: 'SIGTERM'},
  ]) assert.throws(() => auditProduction(() => result));
});
