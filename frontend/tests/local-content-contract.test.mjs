import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { verifyLocalContentContract, verifyTransformerViewerHtml, publishedDocuments } from '../scripts/verify-local-content-contract.mjs';
const root = new URL('../', import.meta.url);
const readAsset = path => readFileSync(new URL(`public${path}`, root));
const scan = '/catalog-source/transformers-2026/page-087.webp';
const registry = () => JSON.parse(readFileSync(new URL('lib/catalog/sources-manifest.json', root)));
const html = '<p data-source-document-notice="transformers-2026">Original supplied separately</p><img src="/catalog-source/transformers-2026/page-187.webp" />';
test('historical original-PDF completeness assertion is preserved byte-for-byte, not approved or silently skipped', () => {
  const bytes = readFileSync(new URL('../../docs/local-content-contract-2026-10-27/history/local-content-migration.test.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'd477969f31db9e2a19f3669da63d3f91f9fd1c3cab31fd348a86de6f3e8acad7');
  assert.ok(bytes.includes("'transformers-2026-original.pdf'"));
});
test('current asset contract checks three PDFs and 187 scans but never claims original bytes verified', () => {
  const report = verifyLocalContentContract();
  assert.equal(report.verifiedScans, 187); assert.equal(report.publishedPdfs, 3);
  assert.equal(report.originalPdfBytes, 'NOT_VERIFIED'); assert.equal(report.originalPdfHash, 'NOT_VERIFIED');
});
test('missing scan and same-size tampering fail closed', () => {
  assert.throws(() => verifyLocalContentContract({ readAsset: path => { if (path === scan) throw new Error('missing scan'); return readAsset(path); } }), /missing scan/);
  assert.throws(() => verifyLocalContentContract({ readAsset: path => { const bytes = readAsset(path); if (path === scan) bytes[100] ^= 1; return bytes; } }), /Scan SHA-256/);
});
test('each published PDF is required, and invalid bytes cannot stand in for a PDF', () => {
  for (const [, target] of publishedDocuments) {
    assert.throws(() => verifyLocalContentContract({ readAsset: path => { if (path === target) throw new Error('missing published PDF'); return readAsset(path); } }), /missing published PDF/);
    assert.throws(() => verifyLocalContentContract({ readAsset: path => path === target ? Buffer.from('not a PDF document') : readAsset(path) }), /Published PDF missing\/invalid/);
  }
});
test('wrong source identity, page metadata, local viewer or raw-PDF destination fail closed', () => {
  const changed = registry(); changed.sources['transformers-2026'].source_sha256 = '0'.repeat(64);
  assert.throws(() => verifyLocalContentContract({ registry: changed }));
  const swapped = registry(); swapped.assets[scan].source_pages = [88];
  assert.throws(() => verifyLocalContentContract({ registry: swapped }));
  assert.throws(() => verifyLocalContentContract({ resourceHref: () => '/documents/transformers-2026-original.pdf' }));
  assert.throws(() => verifyLocalContentContract({ pageUrl: () => '/catalog/source?page=1' }));
  assert.throws(() => verifyLocalContentContract({ pageImage: () => '/catalog-source/page-001.webp' }));
});
test('transformer viewer forbids broken raw downloads and requires its honest notice and actual page', () => {
  verifyTransformerViewerHtml(html, 187);
  for (const changed of [
    html + '<a href="/documents/transformers-2026-original.pdf">PDF</a>',
    html + '<a href="/other.pdf" download="">PDF</a>',
    html + '<a href="/documents/replacement.pdf">Download original</a>',
    html + "<a href='https://drive.google.com/file/d/unknown/view'>PDF</a>",
    html + '<a href="&#x2f;documents%2Freplacement.PDF#page=1">PDF</a>',
    html + '<a href="/anything" download>PDF</a>',
    html + '<a href="https://drive.google.com/file/d/unknown/view">PDF</a>',
    html.replace('data-source-document-notice', 'data-hidden'),
    html.replace('page-187.webp', 'page-001.webp'),
  ]) assert.throws(() => verifyTransformerViewerHtml(changed, 187));
});

test('coordinated scan and manifest tampering cannot establish new evidence', () => {
  const changed = registry(), bytes = Buffer.from('NOT AN IMAGE');
  changed.assets[scan].bytes = bytes.length;
  changed.assets[scan].sha256 = createHash('sha256').update(bytes).digest('hex');
  assert.throws(() => verifyLocalContentContract({ registry: changed, readAsset: path => path === scan ? bytes : readAsset(path) }), /Retained transformer scan manifest changed/);
});
test('fake PDF header and same-size PDF tampering are rejected against retained handoff identities', () => {
  assert.throws(() => verifyLocalContentContract({ readAsset: path => path.endsWith('.pdf') ? Buffer.from('%PDF-FAKE NOT PDF') : readAsset(path) }), /Published PDF size/);
  const target = publishedDocuments[0][1];
  assert.throws(() => verifyLocalContentContract({ readAsset: path => { const bytes = readAsset(path); if (path === target) bytes[100] ^= 1; return bytes; } }), /Published PDF SHA-256/);
});
