import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('production ProductVisual keeps valid source links and survives changed source identity without inventing a destination', () => {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('./helpers/product-visual-source-links.mjs', import.meta.url))], {
    env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', timeout: 30_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { valid: 6, changed: 18, restored: 6 });
});
