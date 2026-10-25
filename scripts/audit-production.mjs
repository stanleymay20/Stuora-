import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const baseline = JSON.parse(readFileSync(new URL('../security/production-audit-baseline.json', import.meta.url), 'utf8'));
const severities = ['info', 'low', 'moderate', 'high', 'critical'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const requireValid = (condition, message) => { if (!condition) throw new Error(message); };
const rank = value => severities.indexOf(value);

// Exported for failure-path regression tests. CI always obtains a fresh audit itself.
export function validateAudit(report, status) {
  requireValid(status === 0 || status === 1, 'npm audit failed to execute successfully.');
  requireValid(object(report) && !report.error && report.auditReportVersion === 2,
    'Missing, errored or unsupported audit report.');
  requireValid(object(report.vulnerabilities) && object(report.metadata?.vulnerabilities),
    'Missing vulnerability data or metadata.');
  const entries = Object.entries(report.vulnerabilities);
  const counts = Object.fromEntries(severities.map(level => [level, 0]));
  for (const [name, value] of entries) {
    const accepted = baseline.vulnerabilities[name];
    requireValid(Object.hasOwn(baseline.vulnerabilities, name), `New vulnerable package: ${name}`);
    requireValid(object(value) && value.name === name && rank(value.severity) >= 0,
      `Malformed package: ${name}`);
    requireValid(value.severity !== 'critical' && rank(value.severity) <= rank(accepted.severity),
      `Severity increased: ${name}`);
    requireValid(typeof value.isDirect === 'boolean' && value.isDirect === accepted.isDirect,
      `Dependency exposure changed: ${name}`);
    requireValid(Array.isArray(value.nodes) && value.nodes.length > 0 &&
      new Set(value.nodes).size === value.nodes.length &&
      value.nodes.every(node => typeof node === 'string' && accepted.nodes.includes(node)),
      `New or malformed vulnerable installation path: ${name}`);
    requireValid(Array.isArray(value.via) && value.via.length > 0, `Missing advisory chain: ${name}`);
    for (const via of value.via) {
      if (typeof via === 'string') {
        requireValid(accepted.via.includes(via) && Object.hasOwn(report.vulnerabilities, via),
          `New or dangling advisory chain: ${name} -> ${via}`);
      } else {
        requireValid(object(via), `Malformed advisory: ${name}`);
        const known = accepted.via.find(item => object(item) && item.url === via.url && item.source === via.source);
        requireValid(known && via.name === known.name && via.dependency === known.dependency &&
          typeof via.range === 'string' && via.range === known.range && rank(via.severity) >= 0 &&
          via.severity !== 'critical' && rank(via.severity) <= rank(known.severity) &&
          object(via.cvss) && typeof via.cvss.score === 'number' && Number.isFinite(via.cvss.score) &&
          via.cvss.score >= 0 && via.cvss.score <= known.cvss.score,
          `New, malformed or worsened advisory: ${name}`);
      }
    }
    counts[value.severity]++;
  }
  // Metro and React Native contain cycles; each package must still reach a real advisory.
  function reachesRoot(name, seen = new Set()) {
    if (seen.has(name)) return false;
    const next = new Set(seen).add(name);
    return report.vulnerabilities[name].via.some(via => object(via) || reachesRoot(via, next));
  }
  for (const [name] of entries) requireValid(reachesRoot(name), `Unrooted advisory chain: ${name}`);
  const metadata = report.metadata.vulnerabilities;
  for (const level of severities) {
    requireValid(Number.isSafeInteger(metadata[level]) && metadata[level] === counts[level],
      `Inconsistent ${level} vulnerability count.`);
  }
  requireValid(Number.isSafeInteger(metadata.total) && metadata.total === entries.length &&
    metadata.total <= baseline.metadata.vulnerabilities.total, 'Inconsistent or increased vulnerability total.');
  requireValid(status === (entries.length ? 1 : 0), 'Audit exit status disagrees with findings.');
  return entries.length;
}

export function auditProduction(runAudit = spawnSync) {
  const run = runAudit('npm', ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8', timeout: 120_000, maxBuffer: 8 * 1024 * 1024,
  });
  requireValid(!run.error && !run.signal && typeof run.stdout === 'string' && run.stdout.trim(),
    'npm audit failed, timed out or produced no JSON.');
  const count = validateAudit(JSON.parse(run.stdout), run.status);
  console.log(`Production dependency audit: ${count} known findings (upper bound 23), no increased risk.`);
  return count;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { auditProduction(); }
  catch (error) { console.error(`Dependency security gate failed: ${error.message}`); process.exitCode = 1; }
}
