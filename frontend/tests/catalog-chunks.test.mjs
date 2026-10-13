import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import * as imported from '../lib/catalog/imported.js';

const docs = new URL('../../docs/catalog-import/', import.meta.url);
const modules = new URL('../lib/catalog/imported-data/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('products.json', docs), 'utf8'));
const sha256 = value => createHash('sha256').update(value).digest('hex');
const parse = url => JSON.parse(readFileSync(url, 'utf8'));
const records = index.chunks.flatMap(chunk => parse(new URL(chunk.path, docs)));

test('catalog chunk index lists every consecutive JSON and JS part exactly once', () => {
  assert.equal(index.format, 'alageum-catalog-chunks-v1');
  assert.equal(index.metadata, 'manifest.json');
  assert.equal(index.recordCount, 224);
  assert.equal(index.maxChunkBytes, 75_000);
  const parts = index.chunks.map((_, i) => `part-${String(i + 1).padStart(3, '0')}`);
  assert.deepEqual(index.chunks.map(chunk => chunk.path), parts.map(part => `products/${part}.json`));
  assert.deepEqual(readdirSync(new URL('products/', docs)).sort(), parts.map(part => `${part}.json`));
  assert.deepEqual(readdirSync(modules).sort(), ['metadata.js', ...parts.map(part => `${part}.js`)]);
  assert.equal(index.chunks.reduce((count, chunk) => count + chunk.recordCount, 0), index.recordCount);
});

test('catalog chunks retain matching whole records, boundary IDs and checksums within UTF-8 limits', async () => {
  for (const chunk of index.chunks) {
    const jsonUrl = new URL(chunk.path, docs);
    const jsUrl = new URL(chunk.path.replace('products/', '').replace('.json', '.js'), modules);
    const content = readFileSync(jsonUrl);
    const items = JSON.parse(content);
    const jsItems = (await import(jsUrl.href)).default;
    assert.equal(items.length, chunk.recordCount, chunk.path);
    assert.equal(items[0].id, chunk.firstId, chunk.path);
    assert.equal(items.at(-1).id, chunk.lastId, chunk.path);
    assert.equal(sha256(content), chunk.sha256, chunk.path);
    assert.deepEqual(jsItems, items, chunk.path);
    assert.equal(JSON.stringify(jsItems), JSON.stringify(items), `${chunk.path} recursive key order`);
    assert.ok(content.length <= index.maxChunkBytes, chunk.path);
    assert.ok(readFileSync(jsUrl).length <= index.maxChunkBytes, jsUrl.href);
  }
  for (const url of [new URL('products.json', docs), new URL(index.metadata, docs), new URL('metadata.js', modules), new URL('../imported.js', modules)]) {
    assert.ok(readFileSync(url).length <= index.maxChunkBytes, url.href);
  }
});

test('reassembled catalog preserves the public exports, data, metadata and all key ordering', () => {
  assert.deepEqual(Object.keys(imported), ['catalogImport', 'importedProducts']);
  assert.deepEqual(records, imported.importedProducts);
  assert.equal(JSON.stringify(records), JSON.stringify(imported.importedProducts));
  const manifest = parse(new URL(index.metadata, docs));
  assert.deepEqual(manifest, imported.catalogImport);
  assert.equal(JSON.stringify(manifest), JSON.stringify(imported.catalogImport));
  assert.equal(records.length, imported.catalogImport.recordCount);
});

test('catalog data matches the canonical frozen pre-split source hashes', () => {
  // SHA-256 of UTF-8 JSON.stringify values from the 2026-10-01 frozen release.
  // No sorted-key normalization: these hashes also guard recursive key order.
  assert.equal(sha256(JSON.stringify(imported.importedProducts)), '6aafae9da3727166b8a76e5b6fefb9a94132d56c0a4d2d603dd8357a4c8874a1');
  assert.equal(sha256(JSON.stringify(imported.catalogImport)), '15f71e1e342ba8636a5517cf838bac82026947b7d180047281a5b6707207d89d');
});
