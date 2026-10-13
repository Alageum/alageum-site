import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const config = JSON.parse(fs.readFileSync(new URL('../../vercel.json', import.meta.url)));
const route = path => config.rewrites.find(rule => new RegExp(`^${rule.source}$`).test(path));

test('services resolve the existing FastAPI entrypoint and Next.js root', () => {
  assert.deepEqual(config.services, {
    backend: { root: 'backend', framework: 'fastapi', entrypoint: 'app.main:app' },
    frontend: { root: 'frontend', framework: 'nextjs' },
  });
  for (const service of Object.values(config.services)) {
    assert.ok(fs.statSync(new URL(`../../${service.root}`, import.meta.url)).isDirectory());
  }
  assert.ok(fs.existsSync(new URL('../../backend/app/main.py', import.meta.url)));
  for (const field of ['framework', 'functions', 'buildCommand', 'installCommand', 'devCommand']) {
    assert.equal(config[field], undefined, `${field} must be service-scoped`);
  }
});

test('API ingress precedes frontend fallback and preserves backend paths', () => {
  for (const path of ['/api/v1/health', '/api/v1/auth/login', '/api/v1/catalog/products',
    '/api/v1/admin/catalog/products', '/api/openapi.json', '/api/missing']) {
    assert.deepEqual(route(path).destination, { service: 'backend' });
  }
  for (const path of ['/', '/catalog', '/catalog/tmg-400', '/admin/catalog', '/login',
    '/documents', '/docs', '/redoc', '/_next/static/example.js', '/brand/alageum.svg']) {
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
