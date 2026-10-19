import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const ci = fs.readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const publicWorkflow = fs.readFileSync(new URL('../../.github/workflows/public-frontend.yml', import.meta.url), 'utf8');
const rfq = fs.readFileSync(new URL('../../.github/workflows/catalog-rfq.yml', import.meta.url), 'utf8');
function job(source, name) {
  const start = source.indexOf(`\n  ${name}:\n`);
  assert.notEqual(start, -1, `Missing executable job ${name}`);
  const rest = source.slice(start + 1);
  const next = rest.slice(1).search(/\n  [a-zA-Z][\w-]*:\n/);
  return next < 0 ? rest : rest.slice(0, next + 1);
}

function assertStandaloneProof(source, logPrefix) {
  assert.match(source, /ALAGEUM_PUBLIC_ONLY: ['"]1['"]/);
  assert.match(source, /NEXT_PUBLIC_CATALOG_SOURCE: static/);
  assert.match(source, /node-version: ['"]24['"]/);
  assert.match(source, /persist-credentials: false/);
  assert.match(source, /working-directory: frontend/);
  const build = source.indexOf('npm run build 2>&1 | tee');
  const proof = source.indexOf('node scripts/check-public-deployment.mjs --browser 2>&1 | tee');
  assert.ok(build > 0 && proof > build, 'Proof must execute the real production build first');
  assert.equal(source.match(/set -o pipefail/g)?.length, 2, 'Build/proof failures must survive log capture');
  assert.match(source, /if: failure\(\)/);
  assert.match(source, /uses: actions\/upload-artifact@v4/);
  for (const file of [`${logPrefix}-build.log`, `${logPrefix}.log`]) {
    assert.ok(source.includes(`| tee ${file}`));
    assert.ok(source.includes(`frontend/${file}`));
  }
  assert.match(source, /frontend\/test-results\//);
  assert.match(source, /frontend\/playwright-report\//);
  assert.match(source, /retention-days: 7/);
  assert.doesNotMatch(source, /^    (?:needs|services):/m);
  assert.doesNotMatch(source, /vercel|setup-python|pip install|uv sync|uvicorn|alembic|scripts\.seed|postgres:|DATABASE_URL|SECRET_KEY|NEXT_PUBLIC_API_URL|API_INTERNAL_BASE_URL/i);
  assert.doesNotMatch(source, /catalog-admin\.spec|security\.spec|e2e\/catalog\.spec|continue-on-error|--pass-with-no-tests/);
}

test('public ingress CI builds standalone Next and proves real HTTP/browser routing without a backend', () => {
  const source = job(ci, 'public-services');
  assertStandaloneProof(source, 'public-services');
  assert.match(source, /tests\/portable-runtime\.test\.mjs/);
  assert.match(source, /tests\/public-deployment\.test\.mjs/);
  assert.match(source, /tests\/public-services-workflow\.test\.mjs/);
  assert.match(source, /timeout-minutes: 20/);
  assert.match(source, /timeout-minutes: 5/);
  assert.match(source, /timeout-minutes: 12/);
});

test('dedicated public workflow retains the standalone build, browser proof and failure evidence', () => {
  assertStandaloneProof(job(publicWorkflow, 'public-frontend'), 'public-frontend');
  assert.match(publicWorkflow, /paths: \['frontend\/\*\*', '\.github\/workflows\/public-frontend\.yml'\]/);
  assert.doesNotMatch(publicWorkflow, /vercel/i);
});

test('public browser capability is explicit and its configuration cannot broaden the auth/default suite', async () => {
  const { default: config } = await import('../playwright.public.config.js');
  const { default: base } = await import('../playwright.config.js');
  assert.equal(config.testMatch, 'public-services.spec.js');
  assert.equal(config.workers, 1);
  assert.equal(config.timeout, 90_000);
  assert.deepEqual(config.expect, { timeout: 15_000 });
  assert.deepEqual(config.projects, base.projects);
  assert.deepEqual(config.use, base.use);
  assert.equal(base.testMatch, undefined);
  assert.equal(base.timeout, undefined);
  assert.equal(base.expect, undefined);
  const spec = fs.readFileSync(new URL('../e2e/public-services.spec.js', import.meta.url), 'utf8');
  assert.match(spec, /test\.skip\(process\.env\.E2E_PUBLIC_SERVICES !== '1'/);
  assert.match(spec, /source or environment files/);
  assert.match(spec, /expect\(apiRequests\)\.toEqual\(\[\]\)/);
  const proof = fs.readFileSync(new URL('../scripts/check-public-deployment.mjs', import.meta.url), 'utf8');
  assert.match(proof, /--config=playwright\.public\.config\.js/);
  assert.match(proof, /e2e\/public-services\.spec\.js/);
  assert.match(proof, /E2E_PUBLIC_SERVICES: '1'/);
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
