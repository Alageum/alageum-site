import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url)));
const route = path => config.rewrites.find(rule => new RegExp(`^${rule.source}$`).test(path));

test('Vercel root has only the public Next service and no legacy backend', () => {
  assert.deepEqual(config.services, {
    frontend: { root: 'frontend', framework: 'nextjs', installCommand: 'npm ci', buildCommand: 'ALAGEUM_PUBLIC_ONLY=1 npm run build', devCommand: 'ALAGEUM_PUBLIC_ONLY=1 npm run dev' },
  });
  assert.ok(fs.statSync(new URL('../../frontend', import.meta.url)).isDirectory());
  for (const field of ['framework', 'functions', 'buildCommand', 'installCommand', 'devCommand']) {
    assert.equal(config[field], undefined, `${field} must be service-scoped`);
  }
});

test('all ingress reaches Next, including API requests refused by public-mode policy', () => {
  assert.deepEqual(config.rewrites, [{ source: '/(.*)', destination: { service: 'frontend' } }]);
  for (const path of ['/api/v1/health', '/api/v1/auth/login', '/api/v1/catalog/products',
    '/api/v1/admin/catalog/products', '/api/openapi.json', '/api/missing', '/', '/catalog',
    '/catalog/tmg-400', '/admin/catalog', '/login', '/documents', '/docs', '/redoc',
    '/_next/static/example.js', '/brand/logo.png']) {
    assert.deepEqual(route(path).destination, { service: 'frontend' });
  }
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
