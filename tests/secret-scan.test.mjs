import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../scripts/scan-secrets.mjs';

test('secret scanner flags provider keys and secret EXPO_PUBLIC variables, not publishable keys', () => {
  const files = {
    'a.ts': 'const k = "gsk_' + 'A'.repeat(48) + '";',
    'b.env': 'EXPO_PUBLIC_GROQ_API_KEY=abcdefghijklmnop1234',
    'c.ts': 'const s = "sb_secret_' + 'x'.repeat(30) + '";',
    'ok.ts': 'const p = "sb_publishable_test_fixture"; const flag = process.env.EXPO_PUBLIC_STUORA_AI_ASSISTANT;',
    'image.webp': 'gsk_' + 'A'.repeat(48),
  };
  const found = scan(Object.keys(files), f => files[f]).map(f => f.file).sort();
  assert.deepEqual(found, ['a.ts', 'b.env', 'c.ts']);
});
