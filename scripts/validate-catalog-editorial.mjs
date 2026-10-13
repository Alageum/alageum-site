#!/usr/bin/env node
// Data integrity only: no application build, UI tests, network or publication.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { digest, readPackage, planImport, safePath } from './import-catalog-editorial.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), value = flag => args[args.indexOf(flag) + 1];
const input = path.resolve(value('--input')), work = path.resolve(value('--work'));
const pkg = readPackage(input);
const active = JSON.parse(fs.readFileSync(path.join(root, 'frontend/lib/catalog/catalogEditorialOverlay.json')));
const { officialProducts, demoProducts } = await import(pathToFileURL(path.join(root, 'frontend/lib/catalog/data.js')));
const { displayProductName, displayExecution, catalogConfigurationLabel, catalogFamilyMembers } = await import(pathToFileURL(path.join(root, 'frontend/lib/catalog/presentation.js')));
const { getCatalogSpecSummary } = await import(pathToFileURL(path.join(root, 'frontend/lib/catalog/grouping.js')));
const { transformerRecordShape } = await import(pathToFileURL(path.join(root, 'frontend/lib/catalog/models/transformer2026Shape.js')));
const originals = new Map(pkg.original.map(r => [r.id, r]));
assert.equal(new Set(officialProducts.map(r => r.id)).size, officialProducts.length);
assert.equal(demoProducts.length, 9);
let fullSourcesPreserved = 0, voltageChecked = 0, labelsChecked = 0, configurationLabelsChecked = 0;
for (const product of officialProducts) {
  if (!originals.has(product.id)) continue;
  const { catalogEditorial, ...raw } = product;
  assert.deepEqual(raw, originals.get(product.id), product.id);
  assert.equal(transformerRecordShape(product), transformerRecordShape(raw));
  fullSourcesPreserved++;
  if (!catalogEditorial) continue; // Conflicting records can be intentionally held.
  assert.equal(digest(raw), catalogEditorial.sourceRecordSha256);
  assert.equal(product.name, catalogEditorial.originalFullName);
  assert.equal(displayProductName(product), catalogEditorial.displayLabel || catalogEditorial.displayName);
  assert.equal(displayExecution(product), catalogEditorial.displayExecution);
  labelsChecked++;
  const voltage = getCatalogSpecSummary(product, officialProducts).find(r => r.key === 'voltage');
  if (voltage) { assert.equal(voltage.value, catalogEditorial.voltageDisplay); assert.deepEqual(voltage.values, catalogEditorial.voltageValues); voltageChecked++; }
  for (const option of catalogEditorial.configurationOptions) {
    const index = Number(/^configurations\[(\d+)\]$/.exec(option.fieldPath)[1]);
    assert.equal(catalogConfigurationLabel(product.configurations[index]), option.displayLabel);
    configurationLabelsChecked++;
  }
  for (const childId of catalogEditorial.navigationChildIds) assert(officialProducts.some(r => r.id === childId));
}
assert.equal(fullSourcesPreserved, 843);
assert.equal(labelsChecked, Object.keys(active.records).length);
assert.equal(new Set(officialProducts.filter(r => r.catalogEditorial).map(displayProductName)).size, labelsChecked);
const oldDisplay = JSON.parse(fs.readFileSync(path.join(work, 'current-display-baseline.json')));
const conflictProduct = { ...pkg.original[0], power: 999 };
const sourceConflict = planImport(pkg, [conflictProduct, ...pkg.original.slice(1)], oldDisplay);
assert.equal(sourceConflict.conflicts.length, 1); assert.equal(sourceConflict.conflicts[0].id, conflictProduct.id);
assert.equal(sourceConflict.counts.recordsChanged, 842);
const manualDisplay = oldDisplay.map((r, index) => index ? r : { ...r, displayName: 'Ручная редакция' });
assert.equal(planImport(pkg, pkg.original, manualDisplay).conflicts[0].reason, 'display_baseline_changed');
const manualSupplement = JSON.parse(JSON.stringify(active));
manualSupplement.records[pkg.original[0].id].displayName = 'Ручная подпись';
const supplementConflict = planImport(pkg, pkg.original, oldDisplay, manualSupplement);
assert.equal(supplementConflict.conflicts[0].reason, 'editorial_values_changed');
assert.equal(supplementConflict.overlay.records[pkg.original[0].id].displayName, 'Ручная подпись');
const extra = { ...pkg.original[0], id: 'local-preserved-extra', name: 'Local manual record' };
assert.deepEqual(planImport(pkg, [...pkg.original, extra], oldDisplay).extraIdsPreserved, [extra.id]);
const second = planImport(pkg, officialProducts, oldDisplay, active);
assert.equal(second.counts.recordsChanged, 0); assert.equal(second.counts.recordsUnchanged, 843);
assert.equal(digest(second.overlay), digest(active));
const inventory = JSON.parse(fs.readFileSync(path.join(work, 'backup/file-sha256.json')));
const allowed = new Set(['frontend/lib/catalog/data.js','frontend/lib/catalog/presentation.js','frontend/lib/catalog/grouping.js']);
let originalFilesPreserved = 0;
for (const [relative, expected] of Object.entries(inventory)) if (!allowed.has(relative)) { assert.equal(digest(fs.readFileSync(path.join(root, relative))), expected, relative); originalFilesPreserved++; }
const release = path.join(root, 'backend-node/data/catalog-editorial/releases', active.generation);
const manifest = JSON.parse(fs.readFileSync(path.join(release, 'manifest.json')));
for (const asset of manifest.assets) { const file = safePath(release, asset.relative); assert.equal(fs.statSync(file).size, asset.bytes); assert.equal(digest(fs.readFileSync(file)), asset.sha256); assert(!file.includes('/frontend/public/')); }
for (const entry of manifest.evidence) assert.equal(digest(fs.readFileSync(safePath(release, entry.path))), entry.sha256);
const photos = JSON.parse(fs.readFileSync(path.join(release, 'photos.json')));
assert.equal(photos.candidates.length, 221); assert.equal(photos.associations.length, pkg.associations.length);
assert(photos.candidates.every(c => c.importPublicationStatus === 'held_pending_rights_and_correspondence' && c.publicationApproved === false));
assert(photos.associations.every(a => originals.has(a.productId) && a.publicationStatus === 'held_pending_rights_and_correspondence'));
const privateProducts = JSON.parse(fs.readFileSync(path.join(release, 'products.json')));
assert.equal(privateProducts.length, officialProducts.length);
for (const product of privateProducts) { const { catalogEditorial, ...raw } = product; assert.deepEqual(raw, originals.get(product.id)); }
const familyCounts = officialProducts.filter(r => r.recordKind === 'family').map(r => ({ id: r.id, members: catalogFamilyMembers(r, officialProducts).map(m => m.id) }));
const report = { validation: 'passed', fullSourceRecordsPreserved: fullSourcesPreserved, uniqueOfficialIds: officialProducts.length, demoRecordsPreserved: demoProducts.length, labelsChecked, voltageRowsChecked: voltageChecked, configurationOccurrencesChecked: configurationLabelsChecked, nestedConfigurations: pkg.configurations.length, navigationFamilies: pkg.hierarchy.families.length, navigationModels: pkg.hierarchy.models.length, originalFilesPreserved, privateAssetsVerified: manifest.assets.length, evidenceFilesVerified: manifest.evidence.length, photoCandidates: photos.candidates.length, photoAssociations: photos.associations.length, newlyPublishedMedia: 0, idempotentPlan: true, manualConflictProtection: true, extraRecordPreservation: true, scope: 'data_integrity_only_no_full_site_tests', familyMembers: familyCounts };
fs.writeFileSync(path.join(work, 'data-integrity-report.json'), JSON.stringify(report, null, 2)+'\n');
console.log(JSON.stringify({ ...report, familyMembers: familyCounts.length },null,2));
