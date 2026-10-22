import assert from 'node:assert/strict';
import test from 'node:test';
import { createBackendBaseResolver } from './backendAddress.ts';

test('native startup never caches an unpublished placeholder port', async () => {
  let calls = 0;
  const resolve = createBackendBaseResolver(() => true, async () => {
    calls += 1;
    return calls === 1 ? null : 51432;
  });
  await assert.rejects(resolve(), /still starting/);
  assert.equal(await resolve(), 'http://127.0.0.1:51432/api');
  assert.equal(await resolve(), 'http://127.0.0.1:51432/api');
  assert.equal(calls, 2);
});

test('native IPC errors do not silently become a browser fallback', async () => {
  let calls = 0;
  const resolve = createBackendBaseResolver(() => true, async () => {
    if (++calls === 1) throw new Error('IPC unavailable');
    return 50821;
  });
  await assert.rejects(resolve(), /IPC unavailable/);
  assert.equal(await resolve(), 'http://127.0.0.1:50821/api');
});

test('only a valid ready native port is publishable', async () => {
  for (const port of [0, -2, 65536, 1.5, NaN]) {
    const resolve = createBackendBaseResolver(() => true, async () => port);
    await assert.rejects(resolve(), /still starting/);
  }
});

test('concurrent startup requests share a single pending native lookup', async () => {
  let calls = 0;
  const resolve = createBackendBaseResolver(() => true, async () => {
    calls++;
    await Promise.resolve();
    return 61001;
  });
  assert.deepEqual(await Promise.all([resolve(), resolve()]), [
    'http://127.0.0.1:61001/api',
    'http://127.0.0.1:61001/api',
  ]);
  assert.equal(calls, 1);
});

test('browser development uses the existing Vite proxy', async () => {
  const resolve = createBackendBaseResolver(() => false, async () => {
    throw new Error('Native lookup should not be called');
  });
  assert.equal(await resolve(), '/api');
});
