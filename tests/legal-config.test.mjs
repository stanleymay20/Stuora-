import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertLegalReady, readOperatorConfig } from '../scripts/load-legal-config.mjs';

const complete = {
  EXPO_PUBLIC_STUORA_OPERATOR_NAME: 'Stuora UG (haftungsbeschränkt)',
  EXPO_PUBLIC_STUORA_OPERATOR_ADDRESS: 'Musterstraße 1, 50667 Köln, Germany',
  EXPO_PUBLIC_STUORA_OPERATOR_EMAIL: 'hello@stuora.de',
  EXPO_PUBLIC_STUORA_OPERATOR_REPRESENTATIVE: 'Jane Founder',
  EXPO_PUBLIC_STUORA_PRIVACY_CONTACT: 'privacy@stuora.de',
  EXPO_PUBLIC_STUORA_SUPERVISORY_AUTHORITY: 'LDI NRW',
  EXPO_PUBLIC_STUORA_LEGAL_REVIEWED: 'confirmed',
};

test('production refuses placeholder or unreviewed legal pages; other modes only warn in-page', () => {
  assert.throws(() => assertLegalReady('production', {}), /production requires completed legal pages/);
  assert.throws(() => assertLegalReady('production', { ...complete, EXPO_PUBLIC_STUORA_LEGAL_REVIEWED: '' }), /LEGAL_REVIEWED/);
  assert.throws(() => assertLegalReady('production', { ...complete, EXPO_PUBLIC_STUORA_OPERATOR_EMAIL: 'ops@example.com' }));
  assert.throws(() => assertLegalReady('production', { ...complete, EXPO_PUBLIC_STUORA_OPERATOR_ADDRESS: 'TODO' }));
  assert.doesNotThrow(() => assertLegalReady('production', complete));
  for (const mode of ['staging', 'test', 'development']) assert.doesNotThrow(() => assertLegalReady(mode, {}));
  const draft = readOperatorConfig({});
  assert.equal(draft.placeholder, true);
  assert.match(draft.name, /to be completed by the operator/);
  assert.equal(readOperatorConfig(complete).placeholder, false);
});
