import { readSecurityHistoricalBytes } from './frontend-security-historical-bytes.mjs';
// Explicit test-only PR41 snapshot; never imported by a release verifier.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/ptmm-browser-correction/historical-test-bytes.json', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), 'c8c494b360b0d0755a9fdfefefa0790e047a27d99c4bbe8c7cf6ae4a43c99796');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, '683134b3d7ef8e0424da752939308e7882a9937a');
export function readCorrectionHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readSecurityHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], bytes = Buffer.from(entry.text);
  assert.equal(digest(bytes), entry.sha256); return bytes;
}
