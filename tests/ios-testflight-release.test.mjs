import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const eas = JSON.parse(readFileSync('eas.json', 'utf8'));
const workflow = readFileSync('.eas/workflows/ios-testflight.yml', 'utf8');

test('TestFlight candidate is the existing Stuora iOS app, version 0.1.6', () => {
  assert.equal(app.name, 'Stuora');
  assert.equal(app.owner, 'stuora');
  assert.equal(app.slug, 'stuora');
  assert.equal(app.version, '0.1.6');
  assert.equal(app.ios.bundleIdentifier, 'com.stuora.app');
  assert.equal(app.ios.buildNumber, '1');
  assert.equal(app.extra?.eas?.projectId, '1ab07441-9b46-45a3-a5f6-2e33ea5bcf30');
});

test('signed TestFlight profile targets staging and the existing App Store Connect record', () => {
  const staging = eas.build['play-internal'];
  const ios = eas.build.testflight;
  assert.equal(ios.extends, 'play-internal');
  assert.equal(ios.ios.credentialsSource, 'remote');
  assert.equal(staging.distribution, 'store');
  assert.equal(staging.environment, 'preview');
  assert.equal(staging.env.EXPO_PUBLIC_STUORA_ENV, 'staging');
  assert.equal(staging.env.EXPO_PUBLIC_SUPABASE_URL, 'https://uptjcspizukpjcoayhtn.supabase.co');
  assert.equal(eas.submit.testflight.ios.ascAppId, '6838005817');
  // Expo's publishable staging key is read from Expo environment; never commit
  // an Apple credential, EXPO_TOKEN, or a service-role key into this profile.
  assert.equal(Object.hasOwn(staging.env, 'EXPO_TOKEN'), false);
  assert.equal(Object.hasOwn(staging.env, 'SUPABASE_SERVICE_ROLE_KEY'), false);
});

test('TestFlight workflow is manual-only and never submits for external beta review', () => {
  assert.match(workflow, /^on:\s*\r?\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(workflow, /^\s*(?:push|schedule|pull_request):/m);
  assert.match(workflow, /type:\s*build/);
  assert.match(workflow, /type:\s*testflight/);
  assert.equal((workflow.match(/profile:\s*testflight/g) ?? []).length, 2);
  assert.match(workflow, /build_id:\s*\$\{\{ needs\.build_ios\.outputs\.build_id \}\}/);
  assert.match(workflow, /submit_beta_review:\s*false/);
  assert.doesNotMatch(workflow, /^\s*(?:external_groups|internal_groups):/m);
});
