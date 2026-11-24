import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionScopedPhotoCache } from '../src/listings/photoSessionCache.ts';

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test('old signed URL response cannot repopulate cache or reach next viewer', async () => {
  const tasks = [];
  const slow = deferred();
  let signCount = 0;
  const cache = new SessionScopedPhotoCache(async paths => {
    assert.deepEqual(paths, ['shared/cover.webp']);
    signCount++;
    if (signCount === 1) return slow.promise;
    return new Map([['shared/cover.webp', 'https://storage.invalid/signed?token=student-b']]);
  }, path => 'https://storage.invalid/public/' + path, 3_600_000, 300_000, () => 0,
  callback => tasks.push(callback));

  const old = cache.resolve('shared/cover.webp');
  tasks.shift()();
  assert.equal(signCount, 1);
  cache.clear(); // SIGNED_OUT or account switch, synchronously before setSession

  const fresh = cache.resolve('shared/cover.webp');
  tasks.shift()();
  assert.equal(await fresh, 'https://storage.invalid/signed?token=student-b');
  slow.resolve(new Map([['shared/cover.webp', 'https://storage.invalid/signed?token=student-a']]));
  assert.equal(await old, null, 'old reply never reaches any later session');
  assert.equal(cache.peek('shared/cover.webp'), 'https://storage.invalid/signed?token=student-b',
    'stale reply does not overwrite the new account cache');
});

test('old scheduled flush cannot erase a new session pending request', async () => {
  const tasks = [];
  let calls = 0;
  const cache = new SessionScopedPhotoCache(async () => {
    calls++;
    return new Map([['a.webp', 'https://storage.invalid/signed?token=new']]);
  }, path => 'https://storage.invalid/public/' + path, 3_600_000, 300_000, () => 0,
  callback => tasks.push(callback));

  const old = cache.resolve('a.webp');
  cache.clear();
  const current = cache.resolve('a.webp');
  tasks.shift()(); // old timer executes after clear
  assert.equal(await old, null);
  assert.equal(calls, 0, 'old request must not make any network signing calls');
  tasks.shift()(); // current viewer timer remains queued
  assert.equal(await current, 'https://storage.invalid/signed?token=new');
  assert.equal(calls, 1);
});

test('coalesces photos, refreshes near expiry, and discards cache on sign-out', async () => {
  const tasks = [];
  let now = 0;
  let calls = 0;
  const cache = new SessionScopedPhotoCache(async paths => {
    calls++;
    assert.deepEqual(paths, calls === 1 ? ['a.webp', 'b.webp'] : ['a.webp']);
    return new Map(paths.map(p => [p, 'https://signed.invalid/' + p + '?v=' + calls]));
  }, path => 'https://public.invalid/' + path, 3600_000, 300_000, () => now,
  callback => tasks.push(callback));

  const a = cache.resolve('a.webp');
  const b = cache.resolve('b.webp');
  assert.equal(tasks.length, 1, 'same tick requests are batched');
  tasks.shift()();
  assert.equal(await a, 'https://signed.invalid/a.webp?v=1');
  assert.equal(await b, 'https://signed.invalid/b.webp?v=1');
  assert.equal(await cache.resolve('a.webp'), 'https://signed.invalid/a.webp?v=1');
  assert.equal(calls, 1);
  now = 3600_000 - 299_000;
  const refresh = cache.resolve('a.webp');
  tasks.shift()();
  assert.equal(await refresh, 'https://signed.invalid/a.webp?v=2');
  cache.clear();
  assert.equal(cache.peek('a.webp'), null);
  assert.equal(cache.peek('b.webp'), null);
});

test('signing failure uses public fallback before bucket cutover; stale failure never resolves private URL', async () => {
  const tasks = [];
  const slow = deferred();
  const cache = new SessionScopedPhotoCache(async () => slow.promise,
    path => 'https://storage.invalid/public/' + path, 3600_000, 300_000, () => 0,
    callback => tasks.push(callback));
  const old = cache.resolve('a.webp');
  tasks.shift()();
  cache.clear();
  slow.resolve(new Map([['a.webp', 'https://storage.invalid/signed?token=old']]));
  assert.equal(await old, null);
  assert.equal(cache.peek('a.webp'), null);

  const failedCache = new SessionScopedPhotoCache(async () => { throw new Error('scanner unavailable'); },
    path => 'https://storage.invalid/public/' + path, 3600_000, 300_000, () => 0,
    callback => tasks.push(callback));
  const fallback = failedCache.resolve('a.webp');
  tasks.shift()();
  assert.equal(await fallback, 'https://storage.invalid/public/a.webp');
  assert.equal(failedCache.peek('a.webp'), null, 'failed signing never caches a public URL as a signed one');
});
