// Production HTTP proof. Run only after ALAGEUM_PUBLIC_ONLY=1 npm run build.
import assert from 'node:assert/strict';
import { cp, readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const browserProof = process.argv.includes('--browser');
const root = fileURLToPath(new URL('../', import.meta.url));
const build = JSON.parse(await readFile(new URL('../.next/required-server-files.json', import.meta.url), 'utf8'));
assert.equal(build.config.env.NEXT_PUBLIC_SITE_MODE, 'public-only', 'Refuse to inspect a different build mode');
// Next's standalone server deliberately omits public/static from its trace.
// Copy only these public build assets, never the repository or backend tree.
await cp(new URL('../public/', import.meta.url), new URL('../.next/standalone/public/', import.meta.url), { recursive: true });
await cp(new URL('../.next/static/', import.meta.url), new URL('../.next/standalone/.next/static/', import.meta.url), { recursive: true });
const reserve = createServer();
await new Promise((resolve, reject) => { reserve.once('error', reject); reserve.listen(0, '127.0.0.1', resolve); });
const port = reserve.address().port; await new Promise(resolve => reserve.close(resolve));
const child = spawn(process.execPath, [fileURLToPath(new URL('../.next/standalone/server.js', import.meta.url))], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1', HOSTNAME: '127.0.0.1', PORT: String(port) } });
let output = ''; child.stdout.on('data', value => { output = (output + value).slice(-8000); }); child.stderr.on('data', value => { output = (output + value).slice(-8000); });
let checks = 0;
const base = `http://127.0.0.1:${port}`;
async function get(path, options = {}) { return fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(30000), ...options }); }
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (child.exitCode !== null) throw new Error(`Next exited before readiness (${child.exitCode})`);
    try { ready = (await get('/')).status === 200; } catch { /* bounded startup wait */ }
    if (ready) break; await delay(250);
  }
  assert.ok(ready, 'Public production server did not become ready');
  for (const path of ['/', '/company', '/catalog', '/catalog/cat-ktpbk', '/selection', '/client', '/client/projects', '/inquiry', '/careers', '/en/company', '/kk/catalog']) {
    const response = await get(path); assert.equal(response.status, 200, path);
    const html = await response.text(); assert.ok(html.includes('Кабинет недоступен') || html.includes('service-unavailable'), path);
    assert.doesNotMatch(html, /type="password"/, path);
    if (path.startsWith('/en/')) assert.match(html, /<html[^>]+lang="en"/);
    if (path.startsWith('/kk/')) assert.match(html, /<html[^>]+lang="kk"/);
    checks++;
  }
  for (const path of ['/login', '/register', '/account', '/b2b/quotes', '/en/account', '/admin/catalog', '/cms', '/pages/ru/about', '/catalog?source=api', '/selection?source=api']) {
    const response = await get(path); assert.equal(response.status, 307, path);
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    const target = new URL(response.headers.get('location'), base);
    assert.equal(target.origin, base); assert.equal(target.search, '');
    const unavailable = await get(target.pathname); assert.equal(unavailable.status, 200);
    const html = await unavailable.text(); assert.match(html, /Сервис временно недоступен/);
    assert.doesNotMatch(html, /<form|type="password"/); checks++;
  }
  for (const path of ['/api/v1/auth/browser-login', '/api/v1/catalog/products', '/en/api/v1/auth/register', '/b2b/quotes']) {
    const response = await get(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 503, path); assert.equal((await response.json()).error.code, 'service_unavailable'); checks++;
  }
  const asset = await get('/brand/logo-lettering-01-red.svg'); assert.equal(asset.status, 200); assert.match(asset.headers.get('content-type') || '', /image\/svg\+xml/); await asset.arrayBuffer(); checks++;
  for (const path of ['/.env', '/README_HANDOFF.md', '/docs/public-deployment.md', '/backend-node/data/catalog-editorial/catalog.json',
    '/backend-node/src/index.js', '/frontend/package.json', '/frontend/next.config.mjs',
    '/frontend/lib/api/client.js', '/frontend/.env', '/frontend/.env.production']) {
    const response = await get(path); assert.equal(response.status, 404, path); await response.arrayBuffer(); checks++;
  }
  if (browserProof) {
    const browser = spawn(process.execPath, [fileURLToPath(new URL('../node_modules/@playwright/test/cli.js', import.meta.url)), 'test', '--config=playwright.vercel.config.js', 'e2e/vercel-services.spec.js', '--max-failures=1'], { cwd: root, stdio: 'inherit', env: { ...process.env, E2E_BASE_URL: base, E2E_VERCEL_SERVICES: '1' } });
    const result = await new Promise((resolve, reject) => { browser.once('error', reject); browser.once('exit', (code, signal) => resolve({ code, signal })); });
    assert.equal(result.code, 0, `Public browser proof failed (${result.signal || result.code})`);
  }
  console.log(JSON.stringify({ mode: 'public-only', checks, passed: checks, backend_started: false, browser_execution: browserProof }));
} catch (error) { console.error(output); throw error; }
finally {
  const stopped = new Promise(resolve => { if (child.exitCode !== null) resolve(); else child.once('exit', resolve); });
  child.kill('SIGTERM'); await Promise.race([stopped, delay(5000)]);
  if (child.exitCode === null) { child.kill('SIGKILL'); await stopped; }
}
