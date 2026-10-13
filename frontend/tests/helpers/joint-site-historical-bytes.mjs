// Exact prior test-only bytes; never imported by production proof code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/joint-site-integration/historical-test-bytes.json', import.meta.url));
assert.equal(digest(bytes), '8e9418c3fe7c8b25da4e7f9e732572e2ef980e9200b4bebb764c79fafb728dac');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, '340c74f63be9b72f35f7ebec689562e2bcdb5ae8');
assert.equal(checkpoint.baseTree, 'd97619b3e9c85233b458704b177740b9b9cca0e8');
export function readJointHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return fallback(file);
  const entry = checkpoint.files[file], value = Buffer.from(entry.text);
  assert.equal(digest(value), entry.sha256); return value;
}
