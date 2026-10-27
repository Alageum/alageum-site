import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const { parse } = createRequire(import.meta.url)('next/dist/compiled/node-html-parser');
import { localResourceHref } from '../lib/public/localResources.js';
import { sourcePageImage, sourcePageUrl } from '../lib/catalog/sources.js';
const root = new URL('../', import.meta.url);
const json = path => JSON.parse(readFileSync(new URL(path, root)));
export const originalIdentity = Object.freeze({
  id: '113q2las1R18OJ6g6laJ5ZN4PFPsY635f', bytes: 844084378, pages: 187,
  sha256: '8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e',
});
// PDF byte identities retained in handoff/GIT_FILE_MANIFEST.json; not new publisher approvals.
export const publishedDocuments = Object.freeze([
  ['https://alageum.com/images/katalog/2Imid_rus2024.pdf', '/documents/alageum-group-2024.pdf', 7011366, 'a74ac37418cf67d0fb63e6ce21f3ae8d3f46443b34708e3bf869a69d048426d7'],
  ['https://asiatrafo.kz/images/referent.pdf', '/documents/asia-trafo-references-2019-2023.pdf', 587833, '89da835622de9ada5a2ff10bf4ed50a33295d863e0f3dcf5b3908d4d1950a4a4'],
  [null, '/documents/substations-local-edition.pdf', 75421849, 'fb5735f489f47c4e50ab7d9698fd27f6b93b0b60caad5587184561538490b109'],
]);
// Injectable boundaries permit destructive negative tests without touching source assets.
export function verifyLocalContentContract({
  registry = json('lib/catalog/sources-manifest.json'),
  provenance = json('../docs/catalog-transformers-2026/review/source-manifest.json'),
  readAsset = path => readFileSync(new URL(`public${path}`, root)),
  resourceHref = localResourceHref, pageImage = sourcePageImage, pageUrl = sourcePageUrl,
} = {}) {
  const source = registry.sources['transformers-2026'];
  assert.equal(provenance.original_pdf_publication_planned, false);
  assert.equal(source.source_file_id, originalIdentity.id);
  assert.equal(source.source_sha256, originalIdentity.sha256);
  assert.equal(source.source_bytes, originalIdentity.bytes);
  assert.equal(source.page_count, originalIdentity.pages);
  assert.equal(provenance.source_file_id, originalIdentity.id);
  assert.equal(provenance.sha256, originalIdentity.sha256);
  assert.equal(provenance.bytes, originalIdentity.bytes);
  assert.equal(provenance.page_count, originalIdentity.pages);
  const sourceUrl = `https://drive.google.com/file/d/${originalIdentity.id}/view`;
  assert.equal(source.source_url, sourceUrl); assert.equal(provenance.url, sourceUrl);
  assert.equal(resourceHref(sourceUrl), '/catalog/source?source=transformers-2026&page=1');
  assert.equal(resourceHref(`${sourceUrl}?usp=sharing`), '/catalog/source?source=transformers-2026&page=1');
  for (const [url, path, size, sha256] of publishedDocuments) {
    if (url) assert.equal(resourceHref(url), path);
    const bytes = readAsset(path);
    assert.ok(bytes.length > 8 && bytes.subarray(0, 5).toString() === '%PDF-', `Published PDF missing/invalid: ${path}`);
    assert.equal(bytes.length, size, `Published PDF size: ${path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha256, `Published PDF SHA-256: ${path}`);
  }
  const scans = Object.entries(registry.assets).filter(([, asset]) => asset.source_id === 'transformers-2026' && asset.representation === 'source-scan').sort(([a], [b]) => a.localeCompare(b));
  assert.equal(scans.length, 187);
  // Pin the 187-entry retained manifest projection independently of mutable asset bytes.
  assert.equal(createHash('sha256').update(JSON.stringify(scans)).digest('hex'), '079e45eac433e1e2a95960ed64fe4164024bea0328f50c791ce2cea05f62ebcc', 'Retained transformer scan manifest changed');
  for (let page = 1; page <= 187; page++) {
    const path = `/catalog-source/transformers-2026/page-${String(page).padStart(3, '0')}.webp`;
    const asset = registry.assets[path];
    assert.equal(asset?.source_id, 'transformers-2026');
    assert.equal(asset?.representation, 'source-scan');
    assert.deepEqual(asset.source_pages, [page]);
    assert.equal(pageImage('transformers-2026', page), path);
    assert.equal(pageUrl('transformers-2026', page), `/catalog/source?source=transformers-2026&page=${page}`);
    const bytes = readAsset(path);
    assert.equal(bytes.length, asset.bytes, `Scan size: ${path}`);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), asset.sha256, `Scan SHA-256: ${path}`);
  }
  return { publishedPdfs: 3, verifiedScans: 187, originalPdfBytes: 'NOT_VERIFIED', originalPdfHash: 'NOT_VERIFIED', originalPdfPublication: 'not planned; separate original unavailable in recovered checkout' };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(verifyLocalContentContract(), null, 2));

export function verifyTransformerViewerHtml(html, page) {
  assert.ok(Number.isInteger(page) && page >= 1 && page <= 187);
  assert.match(html, /data-source-document-notice="transformers-2026"/);
  const document = parse(html);
  for (const anchor of document.querySelectorAll('a')) {
    assert.equal(anchor.hasAttribute('download'), false, 'Transformer viewer must not offer a replacement download');
    const href = anchor.getAttribute('href');
    if (href === undefined) continue;
    let decoded = href;
    for (let pass = 0; pass < 4; pass++) {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    }
    assert.doesNotMatch(decoded, /%[a-f0-9]{2}/i, 'Unresolved encoded destination');
    const url = new URL(decoded, 'https://viewer.invalid');
    assert.equal(url.origin, 'https://viewer.invalid', 'Transformer viewer links must stay local');
    assert.doesNotMatch(url.pathname, /\.pdf(?:$|\/)/i, 'Transformer viewer must not offer a raw or replacement PDF');
  }
  assert.ok(html.includes(`src="/catalog-source/transformers-2026/page-${String(page).padStart(3, '0')}.webp"`));
}
