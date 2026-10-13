import { readJointHistoricalBytes } from './joint-site-historical-bytes.mjs';
// Exact test-only PR45 snapshot. Never imported by production proof code.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/combined-eds-auth/historical-test-bytes.json', import.meta.url));
assert.equal(digest(bytes), 'e93aee16fc9c11fe5724d583daaa647b76effa57f5fd9db112b309ca349e0627');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, 'a32f7878d25a7d4e26d063ec6914b72d2f814383');
assert.equal(checkpoint.baseTree, '0cc608e2020f82aaec678032bc772ec2276c7946');
export function readCombinedHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readJointHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], value = Buffer.from(entry.text);
  assert.equal(digest(value), entry.sha256); return value;
}
