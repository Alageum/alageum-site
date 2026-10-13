import { readKtpbHistoricalBytes } from './ktpb-source-context-historical-bytes.mjs';
// Explicit test-only PR42 snapshot. Release verifiers must never import it.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes = readFileSync(new URL('../../../docs/catalog-transformers-2026/review/frontend-dependency-security/historical-test-bytes.json', import.meta.url));
const digest = value => createHash('sha256').update(value).digest('hex');
assert.equal(digest(bytes), '379c2e0a0ede13b8320823fa5a5cb53fd22e6fcdd1b0570ba67f6ffcbbc71b8c');
const checkpoint = JSON.parse(bytes);
assert.equal(checkpoint.baseCommit, '47db11d6052e82455577f3d9190230d241c5b4c2');
export function readSecurityHistoricalBytes(file, fallback) {
  if (!Object.hasOwn(checkpoint.files, file)) return readKtpbHistoricalBytes(file, fallback);
  const entry = checkpoint.files[file], value = Buffer.from(entry.text);
  assert.equal(digest(value), entry.sha256); return value;
}
