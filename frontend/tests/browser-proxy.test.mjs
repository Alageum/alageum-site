import assert from 'node:assert/strict';
import test from 'node:test';
import { browserApiRewrites } from '../lib/api/browserProxy.js';

test('API proxy is opt-in and uses only the fixed same-origin browser API prefix', () => {
  assert.deepEqual(browserApiRewrites({}), []);
  assert.deepEqual(browserApiRewrites({ API_INTERNAL_BASE_URL: '' }), []);
  assert.deepEqual(browserApiRewrites({ API_INTERNAL_BASE_URL: 'http://127.0.0.1:8000/api/v1/' }), [
    { source: '/api/v1/:path*', destination: 'http://127.0.0.1:8000/api/v1/:path*' },
  ]);
  assert.deepEqual(browserApiRewrites({ API_INTERNAL_BASE_URL: 'https://backend.example.test/api/v1' }), [
    { source: '/api/v1/:path*', destination: 'https://backend.example.test/api/v1/:path*' },
  ]);
  assert.deepEqual(browserApiRewrites({ API_INTERNAL_BASE_URL: 'http://backend:8000/api/v1' }), [
    { source: '/api/v1/:path*', destination: 'http://backend:8000/api/v1/:path*' },
  ]);
});
test('API proxy rejects credentials, fragments, queries, unsupported protocols and widened paths', () => {
  for (const value of ['relative', 'file:///api/v1', 'https://user:secret@backend.test/api/v1',
    'https://backend.test/', 'https://backend.test/api', 'https://backend.test/api/v1?secret=x',
    'https://backend.test/api/v1#fragment', 'https://backend.test/api/v1/other']) {
    assert.throws(() => browserApiRewrites({ API_INTERNAL_BASE_URL: value }));
  }
});
