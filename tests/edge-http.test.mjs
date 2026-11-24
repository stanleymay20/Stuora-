import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
const module = { exports: {} };
runInNewContext(ts.transpileModule(readFileSync('supabase/functions/_shared/http.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { module, exports: module.exports, TextDecoder, setTimeout, clearTimeout });
const { readJson } = module.exports;
const request = (body, headers = {}) => new Request('https://fixture.invalid', {
  method: 'POST', body, duplex: 'half', headers: { 'content-type': 'application/json', ...headers },
});

test('accepts bounded JSON including split UTF-8 characters', async () => {
  const bytes = new TextEncoder().encode('{"city":"Köln"}');
  const stream = new ReadableStream({ start(c) { for (const byte of bytes) c.enqueue(new Uint8Array([byte])); c.close(); } });
  assert.equal((await readJson(request(stream), bytes.length)).city, 'Köln');
});

test('rejects oversized streamed bodies before buffering the rest, even with false length', async () => {
  let pulls = 0, cancelled = false;
  const stream = new ReadableStream({
    pull(c) { pulls++; c.enqueue(new Uint8Array(100)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  await assert.rejects(readJson(request(stream, { 'content-length': '1' }), 10), { status: 413 });
  assert.equal(pulls, 1); assert.equal(cancelled, true);
});

test('stalled bodies time out even when cancellation never settles', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; return new Promise(() => {}); } });
  await assert.rejects(readJson(request(stream), 100, 20), { status: 408 });
  assert.equal(cancelled, true);
});

test('rejects wrong media types, malformed UTF-8 and non-object JSON', async () => {
  await assert.rejects(readJson(request('{}', { 'content-type': 'application/jsonp' })), { status: 415 });
  for (const body of ['null', '[]', '{', new Uint8Array([0xff])]) {
    await assert.rejects(readJson(request(body)), { status: 400 });
  }
  await assert.rejects(readJson(request('{}', { 'content-length': '5000' })), { status: 413 });
});
