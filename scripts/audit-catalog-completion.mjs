// Review output only. Counts are derived from the same guarded selectors as cards.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { officialProducts as products } from '../frontend/lib/catalog/data.js';
import { catalogFamilyMembers, displayDescription, displayProductName, isCatalogFamily } from '../frontend/lib/catalog/presentation.js';
import { getEquipmentVisual } from '../frontend/lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../frontend/lib/catalog/models/iconMap.js';
import { getEquipmentConstructionChoices } from '../frontend/lib/catalog/models/transformerExecutionChoices.js';
import { catalogIdentityCompletion, getCatalogSourceComparisons } from '../frontend/lib/catalog/identityCompletion.js';
import { getCatalogFamilySourceReferences } from '../frontend/lib/catalog/familySourceReferences.js';
import { getNtmiSourcePreview } from '../frontend/lib/catalog/ntmiSourcePreview.js';
import { transformerRecordShape, recordShapeDigest } from '../frontend/lib/catalog/models/transformer2026Shape.js';
import sourceRegistry from '../backend-node/data/catalog-sources.json' with { type: 'json' };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
const rows = products.map(product => {
  const geometry = getEquipmentVisual(product), icon = getEquipmentIcon(product);
  const sourcePreview = getNtmiSourcePreview(product);
  const choices = getEquipmentConstructionChoices(product), members = catalogFamilyMembers(product, products);
  const source = Object.values(sourceRegistry.sources).find(source => source.source_url === product.sourceUrl);
  for (const [field, key] of [['sourceId', 'id'], ['sourceFileId', 'source_file_id'], ['sourceSha256', 'source_sha256']]) {
    if (product[field]) assert.equal(product[field], source?.[key], `Conflicting source for ${product.id}`);
  }
  return {
    id: product.id, name: displayProductName(product), familyId: product.familyId || null,
    role: isCatalogFamily(product) ? 'family-overview' : product.recordKind === 'variant' ? 'explicit-source-entry' : 'legacy-reference',
    cohort: product.sourceId === 'transformers-2026' ? 'transformers-2026' : 'legacy',
    source: { id: source?.id || null, fileId: source?.source_file_id || null, url: product.sourceUrl, pages: product.sourcePages || [], sha256: source?.source_sha256 || null },
    recordShapeSha256: recordShapeDigest(transformerRecordShape(product)),
    visibleDescription: Boolean(displayDescription(product, products)?.trim()),
    technicalSpecRows: product.technicalSpecs?.length || 0,
    configurations: product.configurations?.length || 0,
    familyMembers: members.map(member => member.id),
    familySourceReferences: getCatalogFamilySourceReferences(product, products).map(reference => ({
      canonicalId: reference.canonicalId, panelId: reference.panelId, anchorId: reference.anchorId, href: reference.href,
    })),
    geometry: { type: geometry.type, confidence: geometry.confidence, pages: geometry.sourcePages, reason: geometry.reason },
    icon: { type: icon.type, confidence: icon.confidence, pages: icon.sourcePages },
    constructionChoices: choices.map(choice => ({ id: choice.id, type: choice.geometryType, pages: choice.sourcePages, label: choice.label })),
    sourceContextPreviews: sourcePreview ? [{ panelId: sourcePreview.panelId, geometryType: sourcePreview.geometryType,
      iconType: sourcePreview.iconType, sourceId: sourcePreview.sourceId, sourceFileId: sourcePreview.sourceFileId,
      sourceSha256: sourcePreview.sourceSha256, pages: sourcePreview.sourcePages, href: sourcePreview.sourceHref,
      caption: sourcePreview.caption, dimensionAccurate: false }] : [],
    sourcePanels: getCatalogSourceComparisons(product).map(panel => panel.id),
  };
});
const tally = (items, key) => Object.fromEntries([...new Set(items.map(key))].sort().map(value => [value, items.filter(item => key(item) === value).length]));
const counts = items => ({
  records: items.length, roles: tally(items, row => row.role),
  sourceGroundedDefault3D: items.filter(row => row.geometry.type && row.geometry.confidence === 'source-matched').length,
  genericDefault3D: items.filter(row => row.geometry.type && row.geometry.confidence === 'generic').length,
  noDefault3D: items.filter(row => !row.geometry.type).length,
  explicitChoiceRecords: items.filter(row => row.constructionChoices.length).length,
  explicitChoices: items.reduce((sum, row) => sum + row.constructionChoices.length, 0),
  sourceContextPreviewRecords: items.filter(row => row.sourceContextPreviews.length).length,
  sourceContextPreviews: items.reduce((sum, row) => sum + row.sourceContextPreviews.length, 0),
  noDefaultOrChoice3D: items.filter(row => !row.geometry.type && !row.constructionChoices.length).length,
  icons: tally(items, row => row.icon.confidence),
  familySelectors: items.filter(row => row.familyMembers.length).length,
  familiesWithSourceReferences: items.filter(row => row.familySourceReferences.length).length,
  sourceReferenceLinks: items.reduce((sum, row) => sum + row.familySourceReferences.length, 0),
  blankVisibleDescriptions: items.filter(row => !row.visibleDescription).length,
});
assert.equal(rows.length, 843); assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
assert.ok(rows.every(row => row.visibleDescription));
for (const alias of Object.keys(catalogIdentityCompletion.aliases)) assert.ok(!rows.some(row => row.id === alias));
const ledger = { format: 'alageum-catalog-completion-coverage-v1', reviewedDate: '2026-10-06',
  semantics: 'Each record keeps its identity. Family overviews are not physical products. Choices are display alternatives, not extra products or default constructions. All geometry is illustrative, never CAD or verified dimensions.',
  counts: counts(rows), byCohort: Object.fromEntries(['legacy', 'transformers-2026'].map(cohort => [cohort, counts(rows.filter(row => row.cohort === cohort))])),
  physicalEntries: counts(rows.filter(row => row.role === 'explicit-source-entry')),
  aliases: catalogIdentityCompletion.aliases, sourceRepresentation: catalogIdentityCompletion.counts,
  records: rows,
};
const missing = rows.filter(row => row.role === 'explicit-source-entry' && !row.geometry.type && !row.constructionChoices.length && !row.sourceContextPreviews.length);
const byId = new Map(rows.map(row => [row.id, row]));
const families = [...new Set(missing.map(row => row.familyId))].sort().map(familyId => {
  const family = byId.get(familyId), entries = missing.filter(row => row.familyId === familyId);
  assert.ok(family, `Missing source family ${familyId}`);
  return { familyId, name: family.name, entries: entries.length, cohort: entries[0].cohort,
    sourceUrl: family.source.url, sourcePages: [...new Set(entries.flatMap(row => row.source.pages))].sort((a, b) => a - b),
    ids: entries.map(row => row.id), evidenceLimitations: [...new Set(entries.map(row => row.geometry.reason))].sort() };
});
const gaps = { format: 'alageum-missing-construction-evidence-v1', explicitEntries: missing.length, familyGroups: families.length,
  scope: 'Only explicit entries with neither a source-grounded default nor reviewed selectable 3D. Family overviews and generic legacy references are excluded. Document previews and existing source-based icons remain available where supported. No CAD or hidden construction is inferred.',
  byCohort: tally(missing, row => row.cohort), families };
for (const [name, value] of [['coverage.json', ledger], ['remaining-source-gaps.json', gaps]]) {
  const bytes = Buffer.from(JSON.stringify(value, null, 2) + '\n');
  const target = path.join(root, 'docs/catalog-completion-2026-10-06', name);
  if (check) assert.equal(createHash('sha256').update(fs.readFileSync(target)).digest('hex'), createHash('sha256').update(bytes).digest('hex'), `Stale completion review ${name}`);
  else fs.writeFileSync(target, bytes);
}
console.log(JSON.stringify({ counts: ledger.counts, byCohort: ledger.byCohort, physicalEntries: ledger.physicalEntries,
  missingConstructionEntries: missing.length, missingConstructionFamilies: families.length }, null, 2));
