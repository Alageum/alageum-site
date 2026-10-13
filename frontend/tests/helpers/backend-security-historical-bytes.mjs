import { readCombinedHistoricalBytes } from './combined-eds-auth-historical-bytes.mjs';
// Exact test-only PR44 snapshot. Never imported by production proof code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/backend-dependency-security/historical-test-bytes.json', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), 'afedbb8983fe8f9db4895450cee7d54bab01a303bb8cc1c0675090eea4c6ac54');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, '9dc634a9cc8f1f3341baca3d553703a71cb33d6d');
assert.equal(checkpoint.baseTree, '2cd6d6ad48632334f3409a2bf43578111cc81164');
export function readBackendHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readCombinedHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], value = Buffer.from(entry.text);
  assert.equal(digest(value), entry.sha256); return value;
}
