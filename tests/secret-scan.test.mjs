import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan } from '../scripts/scan-secrets.mjs';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = claims => `const k = "${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.abcdefghijklmnop";`;

test('secret scanner flags provider keys and secret EXPO_PUBLIC variables, not publishable keys', () => {
  const files = {
    'a.ts': 'const k = "gsk_' + 'A'.repeat(48) + '";',
    'b.env': 'EXPO_PUBLIC_GROQ_API_KEY=abcdefghijklmnop1234',
    'c.ts': 'const s = "sb_secret_' + 'x'.repeat(30) + '";',
    'ok.ts': 'const p = "sb_publishable_test_fixture"; const flag = process.env.EXPO_PUBLIC_STUORA_AI_ASSISTANT;',
    'image.webp': 'gsk_' + 'A'.repeat(48),
    'anon.ts': jwt({ iss: 'supabase', ref: 'abcdefghijklmnopqrst', role: 'anon' }),
  };
  // Every project-ref length shifts base64 alignment; all must be caught.
  for (let n = 15; n <= 25; n++) files[`svc${n}.ts`] = jwt({ iss: 'supabase', ref: 'r'.repeat(n), role: 'service_role', iat: 1 });
  const found = scan(Object.keys(files), f => files[f]).map(f => f.file).sort();
  const expected = ['a.ts', 'b.env', 'c.ts', ...Array.from({ length: 11 }, (_, i) => `svc${i + 15}.ts`)].sort();
  assert.deepEqual(found, expected);
});
