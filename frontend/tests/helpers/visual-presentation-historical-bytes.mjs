import { readPtmmHistoricalBytes } from './ptmm-qualification-historical-bytes.mjs';
// Portable PR36 bytes for the earlier synthetic authority-contract tests only.
// New successor tests exercise the current files through the full default chain.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/catalog-visual-presentation/historical-test-bytes.json', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), 'b614eee30bff041c851590b2ce0695a0e3a7180188adba1680a6e366d9f78b0e');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baselineCommit, 'c83265e76c3c671e84e97ed6d8527f788abe46e8');
export function readVisualPresentationHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readPtmmHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], bytes = Buffer.from(entry.text);
  assert.equal(digest(bytes), entry.sha256); return bytes;
}
