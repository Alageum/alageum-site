import { readVisualPresentationHistoricalBytes } from './visual-presentation-historical-bytes.mjs';
// Self-contained historical test inputs work in shallow CI checkouts. This is
// never imported by runtime or release verifiers and supplies no approval.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import fixture from '../../../docs/catalog-transformers-2026/review/protection-context-integration/historical-test-bytes.json' with { type: 'json' };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function historicalReviewedBytes(checkpoint, file) {
  assert.ok(Object.hasOwn(fixture.checkpoints, checkpoint), 'Unknown historical checkpoint');
  const files = fixture.checkpoints[checkpoint].files;
  assert.ok(Object.hasOwn(files, file), `Unpinned historical input ${file}`);
  const entry = files[file], bytes = entry.base64 ? Buffer.from(entry.base64, 'base64') : readVisualPresentationHistoricalBytes(file, current => fs.readFileSync(new URL(`../../../${current}`, import.meta.url)));
  assert.equal(digest(bytes), entry.sha256, `Changed historical test input ${file}`);
  return bytes;
}
