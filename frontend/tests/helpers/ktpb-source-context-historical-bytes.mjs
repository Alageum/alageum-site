import { readBackendHistoricalBytes } from './backend-security-historical-bytes.mjs';
// Explicit test-only PR43 snapshot. Release gates never import this reader.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/ktpb-source-context/historical-test-bytes.json', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), '40ef23c74f780271ced686e5ef9642047285d85d9974cef47ed23c7050811120');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, 'c3241426715e8ab556df48242e405c9b382660ee');
export function readKtpbHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readBackendHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], value = Buffer.from(entry.text);
  assert.equal(digest(value), entry.sha256); return value;
}
