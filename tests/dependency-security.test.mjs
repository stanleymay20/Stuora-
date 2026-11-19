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
  assert.equal(validateAudit(report(), 1), 3);
  const clean = report(); clean.vulnerabilities = {};
  assert.equal(validateAudit(recount(clean), 0), 0);
  const reduced = report(); delete reduced.vulnerabilities.expo;
  assert.equal(validateAudit(recount(reduced), 1), 2);
  const lower = report(); lower.vulnerabilities.minimatch.severity = 'low';
  lower.vulnerabilities.minimatch.via[0].severity = 'low';
  assert.equal(validateAudit(recount(lower), 1), 3);
});
const cases = {
  'missing data': r => { delete r.vulnerabilities; },
  'registry error': r => { r.error = { code: 'E503' }; },
  'unsupported schema': r => { r.auditReportVersion = 3; },
  'missing metadata': r => { delete r.metadata; },
  'inconsistent counts': r => { r.metadata.vulnerabilities.total--; },
  'hidden critical count': r => { r.metadata.vulnerabilities.critical = 1; },
  'critical package': r => { r.vulnerabilities.minimatch.severity = 'critical'; recount(r); },
  'severity escalation': r => { r.vulnerabilities.minimatch.severity = 'high'; recount(r); },
  'new package with unchanged total': r => { r.vulnerabilities.evil = r.vulnerabilities.minimatch; delete r.vulnerabilities.minimatch; },
  'new path': r => { r.vulnerabilities.minimatch.nodes.push('node_modules/evil/node_modules/minimatch'); },
  'missing paths': r => { r.vulnerabilities.minimatch.nodes = []; },
  'changed direct exposure': r => { r.vulnerabilities.minimatch.isDirect = true; },
  'new advisory': r => { r.vulnerabilities.minimatch.via[0].url = 'https://github.com/advisories/NEW'; },
  'wrong advisory package': r => { r.vulnerabilities.minimatch.via = [{ ...r.vulnerabilities.minimatch.via[0], name: 'braces', dependency: 'braces' }]; },
  'new advisory source': r => { r.vulnerabilities.minimatch.via[0].source++; },
  'worsened CVSS': r => { r.vulnerabilities.minimatch.via[0].cvss.score = 9; },
  'missing advisory URL': r => { delete r.vulnerabilities.minimatch.via[0].url; },
  'empty via': r => { r.vulnerabilities.minimatch.via = []; },
  'malformed via': r => { r.vulnerabilities.minimatch.via = [null]; },
  'dangling via': r => { delete r.vulnerabilities.minimatch; recount(r); },
  'rootless cycle': r => { r.vulnerabilities['@expo/fingerprint'].via = ['expo']; },
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
