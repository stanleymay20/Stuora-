import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
const { outputText } = ts.transpileModule(readFileSync('src/account/authCallbackNotice.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const m = await import('data:text/javascript;base64,' + Buffer.from(outputText).toString('base64'));
const base = 'https://stuora-preview-git-x-stanleymay20s-projects.vercel.app/';

test('classifies unusable email-link callbacks without trusting provider text', () => {
  assert.equal(m.classifyAuthCallback(base + '?code=5f8a2d0c-4b1e'), 'code');
  assert.equal(m.classifyAuthCallback(base + '?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid'), 'expired');
  assert.equal(m.classifyAuthCallback(base + '#error=access_denied&error_code=otp_expired'), 'expired');
  assert.equal(m.classifyAuthCallback(base + '?error=server_error&error_description=<script>'), 'error');
  assert.equal(m.classifyAuthCallback(base + '?stuora=housing'), null);
  assert.equal(m.classifyAuthCallback(null), null);
  for (const kind of ['code', 'expired', 'error']) assert.doesNotMatch(m.authCallbackMessage(kind), /<|script/);
});

test('strips callback parameters but keeps the Stuora route', () => {
  assert.equal(m.stripAuthCallbackParams(base + '?stuora=profile&code=abc'), '/?stuora=profile');
  assert.equal(m.stripAuthCallbackParams(base + '?error=x&error_code=otp_expired&error_description=y'), '/');
  assert.equal(m.stripAuthCallbackParams(base + '#error=access_denied&error_code=otp_expired'), '/');
});
