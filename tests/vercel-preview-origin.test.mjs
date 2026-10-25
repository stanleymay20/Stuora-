import test from 'node:test';
import assert from 'node:assert/strict';
import { derivePreviewBranchOrigin, derivePreviewWebOrigin } from '../scripts/build-vercel-web.mjs';
import { validateBackendConfig } from '../scripts/load-backend-config.mjs';

const base = {
  VERCEL_ENV: 'preview',
  VERCEL_URL: 'stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app',
  EXPO_PUBLIC_STUORA_ENV: 'staging',
  EXPO_PUBLIC_SUPABASE_URL: 'https://uptjcspizukpjcoayhtn.supabase.co',
  EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
  EXPO_PUBLIC_STUORA_WEB_ORIGIN: 'https://older-preview.example.com',
};

test('derives exact immutable deployment origin for Stuora staging only', () => {
  const approved = derivePreviewWebOrigin(base);
  assert.equal(approved, 'https://' + base.VERCEL_URL);
  assert.equal(validateBackendConfig({
    mode: base.EXPO_PUBLIC_STUORA_ENV,
    url: base.EXPO_PUBLIC_SUPABASE_URL,
    key: base.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    webOrigin: approved,
  }, approved).mode, 'staging');
  assert.throws(() => validateBackendConfig({
    mode: 'staging', url: base.EXPO_PUBLIC_SUPABASE_URL,
    key: base.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, webOrigin: approved,
  }, 'https://other-deployment.vercel.app'), /not approved/);
});

test('Vercel preview refuses wrong backend, environment or deployment hostname', () => {
  const mutations = [
    { EXPO_PUBLIC_STUORA_ENV: 'production' },
    { EXPO_PUBLIC_STUORA_ENV: 'test' },
    { EXPO_PUBLIC_SUPABASE_URL: 'https://mljmifovcthvtuquvyzf.supabase.co' },
    { EXPO_PUBLIC_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co' },
    { VERCEL_URL: '' },
    { VERCEL_URL: 'stuora-preview-git-feat-stuora-ai-5a5ebe-stanleymay20s-projects.vercel.app' },
    { VERCEL_URL: 'stuora-preview-acez6tl63-other-team.vercel.app' },
    { VERCEL_URL: 'https://stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app' },
    { VERCEL_URL: 'stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app.evil.com' },
    { VERCEL_URL: 'stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app/path' },
    { VERCEL_URL: 'stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app?x=1' },
  ];
  for (const change of mutations) {
    assert.throws(() => derivePreviewWebOrigin({ ...base, ...change }), 'must reject ' + JSON.stringify(change));
  }
});

const BRANCH = 'stuora-preview-git-fix-stuora-gen-ac6adc-stanleymay20s-projects.vercel.app';
test('the stable Git-branch URL is approved alongside the immutable URL, staging only', () => {
  const env = { ...base, VERCEL_BRANCH_URL: BRANCH };
  const alias = derivePreviewBranchOrigin(env);
  assert.equal(alias, 'https://' + BRANCH);
  const cfg = { mode: 'staging', url: base.EXPO_PUBLIC_SUPABASE_URL, key: base.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    webOrigin: derivePreviewWebOrigin(env), webOriginAlias: alias };
  assert.equal(validateBackendConfig(cfg, alias).mode, 'staging');
  assert.equal(validateBackendConfig(cfg, cfg.webOrigin).mode, 'staging');
  assert.throws(() => validateBackendConfig(cfg, 'https://stuora-preview-git-other-123456-stanleymay20s-projects.vercel.app'), /not approved/);
  assert.throws(() => validateBackendConfig({ ...cfg, mode: 'production', url: 'https://mljmifovcthvtuquvyzf.supabase.co' }, alias), /branch alias/);
  assert.throws(() => validateBackendConfig({ ...cfg, webOriginAlias: 'http://' + BRANCH }, alias));
  assert.equal(derivePreviewBranchOrigin({ ...base, VERCEL_BRANCH_URL: '' }), null);
  assert.equal(derivePreviewBranchOrigin({ ...env, VERCEL_ENV: 'production' }), null);
  for (const bad of [
    'stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app',
    'stuora-preview-git-x-other-team.vercel.app',
    BRANCH + '.evil.com', 'https://' + BRANCH, BRANCH + '/path',
    'stuora-preview-git-' + 'a'.repeat(60) + '-stanleymay20s-projects.vercel.app',
  ]) assert.throws(() => derivePreviewBranchOrigin({ ...base, VERCEL_BRANCH_URL: bad }), bad);
});

test('outside Preview never modifies origin, including production deploys and local tests', () => {
  for (const env of ['production', 'development', undefined]) {
    assert.equal(derivePreviewWebOrigin({ ...base, VERCEL_ENV: env }), null);
  }
});
