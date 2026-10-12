import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBackendConfig } from '../scripts/load-backend-config.mjs';
const production = { mode: 'production', url: 'https://mljmifovcthvtuquvyzf.supabase.co', key: 'sb_publishable_valid', webOrigin: 'https://students.example.com' };
const staging = { ...production, mode: 'staging', url: 'https://abcdefghijklmnopqrst.supabase.co', webOrigin: 'https://preview.example.com' };
const mock = { mode: 'test', url: 'https://stuora-test.invalid', key: 'sb_publishable_test_fixture' };
test('accepts explicit production/staging, local development and isolated test configuration', () => {
  for (const config of [production, staging, mock, { ...mock, mode: 'development', url: 'http://127.0.0.1:54321' }]) assert.equal(validateBackendConfig(config).url, config.url);
  validateBackendConfig(production, production.webOrigin);
  validateBackendConfig(staging, staging.webOrigin);
  validateBackendConfig(mock, 'http://127.0.0.1:4173');
});
const cases = {
  'missing mode': { ...production, mode: undefined },
  'unknown mode': { ...production, mode: 'preview' },
  'missing URL': { ...production, url: undefined },
  'missing key': { ...production, key: undefined },
  'secret key': { ...production, key: 'sb_secret_unsafe' },
  'legacy JWT': { ...production, key: 'eyJhbGciOiJIUzI1NiJ9.secret' },
  'empty publishable key': { ...production, key: 'sb_publishable_' },
  'production wrong project': { ...production, url: staging.url },
  'staging production project': { ...staging, url: production.url },
  'development production project': { ...production, mode: 'development' },
  'test production project': { ...production, mode: 'test' },
  'hosted URL with path': { ...staging, url: staging.url + '/rest/v1' },
  'hosted URL with query': { ...staging, url: staging.url + '?a=b' },
  'hosted URL with credentials': { ...staging, url: 'https://user:pass@abcdefghijklmnopqrst.supabase.co' },
  'hosted HTTP': { ...staging, url: staging.url.replace('https:', 'http:') },
  'lookalike backend': { ...staging, url: staging.url + '.evil.com' },
  'unknown hosted backend': { ...staging, url: 'https://example.com' },
  'development remote backend': { ...staging, mode: 'development' },
  'development wrong port': { ...mock, mode: 'development', url: 'http://localhost:3000' },
  'test wrong fixture': { ...mock, key: 'sb_publishable_real' },
  'test remote backend': { ...mock, url: staging.url },
  'missing hosted origin': { ...production, webOrigin: undefined },
  'HTTP hosted origin': { ...production, webOrigin: 'http://students.example.com' },
  'local hosted origin': { ...production, webOrigin: 'https://localhost' },
  'origin with path': { ...production, webOrigin: production.webOrigin + '/app' },
  'origin with credentials': { ...production, webOrigin: 'https://u:p@students.example.com' },
};
for (const [name, config] of Object.entries(cases)) test(`rejects ${name}`, () => assert.throws(() => validateBackendConfig(config)));
test('rejects production bundle on local/preview origins and test bundle on hosted origin', () => {
  for (const host of ['http://localhost:4173', staging.webOrigin, production.webOrigin + '.evil.com']) assert.throws(() => validateBackendConfig(production, host));
  assert.throws(() => validateBackendConfig(mock, production.webOrigin));
});
