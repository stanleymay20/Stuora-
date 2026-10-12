import { spawnSync } from 'node:child_process';

const allowedPackages = new Set([
  '@expo/cli',
  '@expo/code-signing-certificates',
  '@expo/config',
  '@expo/config-plugins',
  '@expo/inline-modules',
  '@expo/local-build-cache-provider',
  '@expo/metro',
  '@expo/metro-config',
  '@expo/prebuild-config',
  '@react-native/community-cli-plugin',
  '@react-native/virtualized-lists',
  'braces',
  'expo',
  'metro',
  'metro-config',
  'metro-file-map',
  'metro-transform-worker',
  'micromatch',
  'node-forge',
  'react-native',
  'uuid',
  'xcode',
]);

const allowedAdvisories = new Set([
  'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm',
  'https://github.com/advisories/GHSA-86w9-cpqp-85rv',
  'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
]);

const run = spawnSync('npm', ['audit', '--omit=dev', '--json'], { encoding: 'utf8' });
if (!run.stdout) {
  console.error(run.stderr || 'npm audit produced no JSON output.');
  process.exit(1);
}

let report;
try {
  report = JSON.parse(run.stdout);
} catch (error) {
  console.error('Could not parse npm audit JSON.', error);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities ?? {};
const names = Object.keys(vulnerabilities);
const unexpectedPackages = names.filter(name => !allowedPackages.has(name));
const advisoryUrls = new Set();
for (const value of Object.values(vulnerabilities)) {
  for (const via of value.via ?? []) {
    if (typeof via === 'object' && via?.url) advisoryUrls.add(via.url);
  }
}
const unexpectedAdvisories = [...advisoryUrls].filter(url => !allowedAdvisories.has(url));
const critical = report.metadata?.vulnerabilities?.critical ?? 0;
const total = report.metadata?.vulnerabilities?.total ?? names.length;

console.log(`Production dependency audit: ${total} inherited findings, ${critical} critical.`);
console.log(`Known upstream advisory URLs: ${[...advisoryUrls].sort().join(', ') || 'none'}`);

if (critical > 0 || unexpectedPackages.length || unexpectedAdvisories.length || total > allowedPackages.size) {
  if (unexpectedPackages.length) console.error(`Unexpected vulnerable packages: ${unexpectedPackages.join(', ')}`);
  if (unexpectedAdvisories.length) console.error(`Unexpected advisories: ${unexpectedAdvisories.join(', ')}`);
  if (critical > 0) console.error('Critical production dependency findings are never accepted by the baseline.');
  if (total > allowedPackages.size) console.error(`Audit finding count ${total} exceeds controlled baseline ${allowedPackages.size}.`);
  process.exit(1);
}

console.log('No new production dependency advisory exceeds the controlled Expo/Metro build-tool baseline.');
