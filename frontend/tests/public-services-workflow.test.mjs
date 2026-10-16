import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ci = fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const rfq = fs.readFileSync(new URL('../../.github/workflows/catalog-rfq.yml', import.meta.url), 'utf8');
function job(source, name) {
  const start = source.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `Missing executable job ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-zA-Z][\w-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

test('Vercel ingress CI starts only the public frontend and exercises its real routing', () => {
  const source = job(ci, 'vercel-services');
  assert.match(source, /ALAGEUM_PUBLIC_ONLY: ['"]1['"]/);
  assert.match(source, /node-version: ['"]24['"]/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /vercel dev -L --listen 127\.0\.0\.1:3200/);
  assert.match(source, /\$\{E2E_BASE_URL\}\/catalog/);
  assert.match(source, /npm run test:e2e:vercel -- e2e\/vercel-services\.spec\.js --max-failures=1/);
  assert.match(source, /tests\/public-services-workflow\.test\.mjs/);
  assert.match(source, /trap cleanup EXIT/);
  assert.doesNotMatch(source, /^    (?:needs|services):/m);
  assert.doesNotMatch(source, /setup-python|pip install|uv sync|uvicorn|alembic|scripts\.seed|postgres:|DATABASE_URL|SECRET_KEY|NEXT_PUBLIC_API_URL|API_INTERNAL_BASE_URL/);
  assert.doesNotMatch(source, /catalog-admin\.spec|security\.spec|e2e\/catalog\.spec|continue-on-error|--pass-with-no-tests/);
});

test('deployment migration retains separate catalogue and all current/legacy RFQ assertions', () => {
  const catalogue = job(ci, 'transformer-source-browser');
  assert.match(catalogue, /npm run test:e2e:catalog -- --reporter=github,json/);
  const node = job(rfq, 'rfq-browser');
  assert.match(node, /npm run test:e2e:quotes -- --max-failures=3/);
  assert.match(node, /login through UI\|RFQ and ticket creation through UI\|persisted legacy bearer cannot restore a browser session even with an existing cookie/);
  assert.match(node, /--browser-results playwright-report\/security-results\.json/);
  const legacy = job(rfq, 'legacy-api-security');
  assert.match(legacy, /foreign order and document are hidden\|AI read isolation and scoped write confirmation/);
  assert.match(legacy, /--legacy-results playwright-report\/security-results\.json/);
  for (const source of [catalogue, node, legacy]) assert.doesNotMatch(source, /continue-on-error|--pass-with-no-tests/);
});
