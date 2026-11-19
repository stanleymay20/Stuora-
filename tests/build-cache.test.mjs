import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Metro's transform cache does not track EXPO_PUBLIC_* values. Without --clear,
// a second export on the same machine reuses the previous build's backend URL,
// publishable key and feature flags. Every export must start from a clean cache.
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ci = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');

test('package export scripts clear the Metro cache', () => {
  const exports = Object.entries(pkg.scripts).filter(([, cmd]) => /\bexpo export\b/.test(cmd));
  assert.ok(exports.length > 0);
  for (const [name, cmd] of exports) assert.match(cmd, /(^|\s)--clear(\s|$)/, `${name} must pass --clear`);
});

test('CI never runs a direct expo export without --clear', () => {
  const direct = ci.split('\n').filter(line => /\bexpo export\b/.test(line));
  for (const line of direct) assert.match(line, /(^|\s)--clear(\s|$)/, `CI export must pass --clear: ${line.trim()}`);
});
