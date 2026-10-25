// HTTP smoke of the connected standalone artifact, deliberately without a backend.
// This does not prove browser hydration, authentication, SMTP or Compose/TLS.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../.next/required-server-files.json', import.meta.url), 'utf8'));
assert.equal(manifest.config.output, 'standalone', 'Build standalone first');
assert.equal(manifest.config.env.NEXT_PUBLIC_SITE_MODE, 'connected', 'This smoke requires the connected application');
assert.equal(manifest.config.experimental.cpus, 2, 'Keep bounded build concurrency');
const reserve = createServer();
await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const child = spawn(process.execPath, [fileURLToPath(new URL('../.next/standalone/server.js', import.meta.url))], {
  cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, HOSTNAME: '127.0.0.1', PORT: String(port), NEXT_TELEMETRY_DISABLED: '1', API_INTERNAL_BASE_URL: 'http://127.0.0.1:1/api/v1' },
});
let logs = '';
child.stdout.on('data', data => { logs = (logs + data).slice(-8000); });
child.stderr.on('data', data => { logs = (logs + data).slice(-8000); });
const checks = [];
const get = path => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000) });
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Standalone exited: ${child.exitCode}`);
    try { ready = (await get('/healthz')).status === 200; } catch { /* bounded startup wait */ }
    if (ready) break;
    await delay(250);
  }
  assert.ok(ready, 'Standalone did not become ready');
  const health = await get('/healthz');
  assert.match(health.headers.get('cache-control'), /no-store/);
  assert.deepEqual(await health.json(), { status: 'ok', service: 'frontend', check: 'liveness' });
  checks.push('uncached frontend liveness');
  for (const path of ['/', '/company', '/careers', '/catalog', '/catalog/source?source=transformers-2026&page=1', '/selection', '/contacts', '/login', '/register', '/forgot-password', '/en/company', '/kk/company']) {
    const response = await get(path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('x-powered-by'), null, path);
    const html = await response.text();
    assert.match(html, /<html/, path);
    assert.doesNotMatch(html, /data-static-preview=/, `${path} is the actual application, not the static snapshot`);
    const locale = path.startsWith('/en/') ? 'en' : path.startsWith('/kk/') ? 'kk' : 'ru';
    assert.match(html, new RegExp(`<html[^>]+lang="${locale}"`), path);
    if (path === '/login') assert.match(html, /type="password"/);
    checks.push(`connected route ${path}`);
  }
  const news = await get('/news');
  assert.equal(news.status, 200);
  assert.match(await news.text(), /Новости временно недоступны/);
  checks.push('unreachable CMS is shown honestly, not replaced by bundled news');
  for (const path of ['/.env', '/backend-node/package.json', '/docs/ADMINISTRATOR-RU.md', '/frontend/package.json']) {
    const response = await get(path);
    assert.equal(response.status, 404, path);
    await response.arrayBuffer();
    checks.push(`source is not exposed: ${path}`);
  }
  const logo = await get('/brand/logo-lettering-01-red.svg');
  assert.equal(logo.status, 200);
  assert.match(logo.headers.get('content-type'), /image\/svg\+xml/);
  await logo.arrayBuffer();
  checks.push('standalone public assets');
  console.log(JSON.stringify({ passed: checks.length, checks, backend: 'intentionally not started', browser: 'not tested by this HTTP smoke', tls: 'not tested by this loopback smoke' }, null, 2));
} catch (error) {
  console.error(logs);
  throw error;
} finally {
  const stopped = new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  child.kill('SIGTERM');
  await Promise.race([stopped, delay(5000)]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await stopped; }
}
