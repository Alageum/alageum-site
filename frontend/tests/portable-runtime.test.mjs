import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deploymentMode } from '../lib/deployment/config.js';
import { prepareStandalone } from '../scripts/prepare-standalone.mjs';
import { GET, HEAD, dynamic } from '../app/healthz/route.js';

test('self-hosted builds default to connected standalone Next without active platform wiring', () => {
  assert.equal(deploymentMode({}), 'connected');
  assert.equal(deploymentMode({ ALAGEUM_PUBLIC_ONLY: '0', NEXT_PUBLIC_API_URL: '/api/v1' }), 'connected');
  const nextSource = fs.readFileSync(new URL('../next.config.mjs', import.meta.url), 'utf8');
  assert.match(nextSource, /output: "standalone"/);
  assert.match(nextSource, /experimental: \{ cpus: 2 \}/);
  const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(pkg.scripts['build:standalone'], 'next build && node scripts/prepare-standalone.mjs');
  assert.equal(pkg.scripts['start:standalone'], 'node .next/standalone/server.js');
  assert.doesNotMatch(JSON.stringify(pkg), /vercel|ALAGEUM_PUBLIC_ONLY=1/i);
  // The retired-host guard is intentionally retained while the repository is
  // still linked there. It must never select an application service or runtime.
  for (const path of ['../../vercel.json', '../vercel.json']) {
    const guard = JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
    assert.equal(guard.framework, null);
    for (const key of ['services', 'functions', 'builds']) assert.equal(Object.hasOwn(guard, key), false);
  }
});

test('standalone packaging adds only public assets and refuses an incompatible build', async () => {
  const root = await mkdtemp(join(tmpdir(), 'alageum-standalone-'));
  try {
    for (const path of ['.next/standalone', '.next/static', 'public', 'backend']) await mkdir(join(root, path), { recursive: true });
    await writeFile(join(root, '.next/standalone/server.js'), '// generated Next server');
    await writeFile(join(root, '.next/static/chunk.js'), '// public bundle');
    await writeFile(join(root, 'public/logo.svg'), '<svg/>');
    await writeFile(join(root, '.env'), 'TEST_SECRET=not-a-real-secret');
    await writeFile(join(root, 'backend/private.json'), '{}');
    await writeFile(join(root, '.next/required-server-files.json'), JSON.stringify({ config: { output: 'export' } }));
    await assert.rejects(prepareStandalone(root), /standalone Next/);
    await assert.rejects(access(join(root, '.next/standalone/public')), { code: 'ENOENT' });
    await writeFile(join(root, '.next/required-server-files.json'), JSON.stringify({ config: { output: 'standalone' } }));
    const output = await prepareStandalone(root);
    assert.equal(await readFile(join(output, 'public/logo.svg'), 'utf8'), '<svg/>');
    assert.equal(await readFile(join(output, '.next/static/chunk.js'), 'utf8'), '// public bundle');
    for (const path of ['.env', 'backend', 'package-lock.json']) await assert.rejects(access(join(output, path)), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('frontend health is uncached liveness and makes no readiness claim', async () => {
  assert.equal(dynamic, 'force-dynamic');
  const response = GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', service: 'frontend', check: 'liveness' });
  assert.equal(HEAD().status, 200);
  assert.equal(await HEAD().text(), '');
});

test('browser API defaults to same-origin and still permits an explicit local override', async () => {
  const before = process.env.NEXT_PUBLIC_API_URL;
  const originalFetch = globalThis.fetch;
  try {
    for (const [configured, expected] of [
      [undefined, '/api/v1/health'],
      ['', '/api/v1/health'],
      ['http://localhost:8000/api/v1', 'http://localhost:8000/api/v1/health'],
    ]) {
      if (configured === undefined) delete process.env.NEXT_PUBLIC_API_URL;
      else process.env.NEXT_PUBLIC_API_URL = configured;
      let requested;
      globalThis.fetch = async (url, options) => {
        requested = { url, options };
        return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
      };
      const { apiFetch } = await import(`../lib/api/client.js?api-base=${encodeURIComponent(String(configured))}`);
      assert.deepEqual(await apiFetch('/health'), { status: 'ok' });
      assert.equal(requested.url, expected);
      assert.equal(requested.options.cache, 'no-store');
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (before === undefined) delete process.env.NEXT_PUBLIC_API_URL;
    else process.env.NEXT_PUBLIC_API_URL = before;
  }
});

