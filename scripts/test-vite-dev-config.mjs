import assert from 'node:assert/strict';
import { test } from 'node:test';
import { resolve } from 'node:path';
import { loadConfigFromFile } from 'vite';

// Inspect Vite's actual resolved source config, not a duplicated string.
test('desktop development Vite binds only to loopback and ignores generated runtime output', async () => {
  const loaded = await loadConfigFromFile(
    { command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false },
    resolve('vite.config.ts'),
  );
  assert.ok(loaded, 'Vite config must be loadable');
  const server = loaded.config.server;
  assert.equal(server?.host, '127.0.0.1');
  assert.equal(server?.port, 3000);
  assert.equal(server?.strictPort, true);
  assert.equal(server?.proxy?.['/api']?.target, 'http://127.0.0.1:8000');
  assert.deepEqual(server?.watch?.ignored, [
    '**/src-tauri/target/**',
    '**/sidecar/target/**',
  ]);
});
