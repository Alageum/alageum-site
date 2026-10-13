import { readCorrectionHistoricalBytes } from './ptmm-browser-correction-historical-bytes.mjs';
// Test-only PR40 snapshot. Never import this reader from a release verifier.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/ptmm-dimension-qualification/historical-test-bytes.json', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), 'f656ca40a032c2819c0677826e60abc2781ef8fdb9ce6df68ef85d7e27483117');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, '27e143efa1e0cbe850887a6807b17ea29a2877da');
export function readPtmmHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readCorrectionHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], bytes = Buffer.from(entry.text);
  assert.equal(digest(bytes), entry.sha256); return bytes;
}
