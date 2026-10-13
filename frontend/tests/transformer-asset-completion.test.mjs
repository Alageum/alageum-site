import { jointRequiredFiles, jointClearancePath, jointReportPath } from '../../scripts/catalog/joint-site-reviewed-dependencies.mjs';
import { combinedRequiredFiles, combinedClearancePath, combinedReportPath } from '../../scripts/catalog/combined-eds-auth-reviewed-dependencies.mjs';
import { backendRequiredFiles, backendClearancePath, backendReportPath } from '../../scripts/catalog/backend-security-reviewed-dependencies.mjs';
import { ktpbRequiredFiles, ktpbClearancePath, ktpbReportPath } from '../../scripts/catalog/ktpb-source-context-reviewed-dependencies.mjs';
import { securityRequiredFiles, securityClearancePath, securityReportPath } from '../../scripts/catalog/frontend-security-reviewed-dependencies.mjs';
import { correctionRequiredFiles, correctionClearancePath, correctionReportPath } from '../../scripts/catalog/ptmm-browser-correction-reviewed-dependencies.mjs';
import { ptmmRequiredFiles, ptmmClearancePath, ptmmReportPath } from '../../scripts/catalog/ptmm-qualification-reviewed-dependencies.mjs';
import { visualRequiredFiles, visualClearancePath, visualReportPath } from '../../scripts/catalog/visual-presentation-reviewed-dependencies.mjs';
import { historicalDependencyHash, sourceAssetClearancePath } from '../../scripts/catalog/source-asset-reviewed-dependencies.mjs';
import { measurementColumnClearancePath } from '../../scripts/catalog/measurement-column-reviewed-dependencies.mjs';
import { protectionContextClearancePath } from '../../scripts/catalog/protection-context-reviewed-dependencies.mjs';
import { browserRequiredFiles, browserClearancePath, browserReportPath } from '../../scripts/catalog/catalog-browser-reviewed-dependencies.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { officialProducts, transformerProducts, identityCompletionProducts } from '../lib/catalog/data.js';
import { normalizeApiProduct } from '../lib/catalog/apiData.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { getReviewedTransformerAsset, transformerRuntimeManifest } from '../lib/catalog/models/transformer2026Runtime.js';
import { transformerRecordShape } from '../lib/catalog/models/transformer2026Shape.js';
import { getEquipmentConstructionChoices as choices, getEquipmentConstructionChoice as select, transformerExecutionChoicesManifest } from '../lib/catalog/models/transformerExecutionChoices.js';
import { buildTransformerAssetCompletion } from '../../scripts/approve-transformer-asset-completion.mjs';
import { assertReviewedTransformerDependency } from '../../scripts/catalog/transformer-reviewed-dependencies.mjs';
import supplement from '../lib/catalog/models/transformer2026AssetCompletionManifest.json' with { type: 'json' };
import baseAssets from '../lib/catalog/models/transformer2026RuntimeManifest.json' with { type: 'json' };
import baseChoices from '../lib/catalog/models/transformerExecutionChoicesManifest.json' with { type: 'json' };

const root = new URL('../../', import.meta.url);
const clearance = JSON.parse(fs.readFileSync(new URL('docs/catalog-transformers-2026/review/asset-completion/clearance.json', root), 'utf8'));
const successorPath = new URL(measurementColumnClearancePath, root);
const successorClearance = fs.existsSync(successorPath) ? JSON.parse(fs.readFileSync(successorPath, 'utf8')) : null;
const backendPath = new URL(backendClearancePath, root);
const backendClearance = fs.existsSync(backendPath) ? JSON.parse(fs.readFileSync(backendPath, 'utf8')) : null;
const combinedPath = new URL(combinedClearancePath, root);
const combinedClearance = fs.existsSync(combinedPath) ? JSON.parse(fs.readFileSync(combinedPath, 'utf8')) : null;
const jointPath = new URL(jointClearancePath, root);
const jointClearance = fs.existsSync(jointPath) ? JSON.parse(fs.readFileSync(jointPath, 'utf8')) : null;
const successorApproved = jointClearance?.status === 'approved-bounded-joint-site' && combinedClearance?.status === 'approved-bounded-combined-eds-auth' && successorClearance?.status === 'approved-bounded-measurement-columns'
  && backendClearance?.status === 'approved-bounded-backend-security';
const byId = new Map(officialProducts.map(row => [row.id, row]));
const rows = clearance.records.map(entry => byId.get(entry.sourceRecordId));
const recordApproval = id => supplement.geometry[id] || supplement.executionChoices.records[id];
const api = record => normalizeApiProduct({
  id: recordApproval(record.id).database_id, public_key: record.id, sku: null,
  category_public_key: record.category, translations: { ru: { name: record.name } },
  specs: record, provenance: record,
  media: [{ path: record.image, kind: 'image', alt: record.imageCaption }],
});

test('supplement retains 25 exact defaults and 8 alternatives; historical release requires any forward amendment to be independently approved', () => {
  if (successorApproved) assert.deepEqual(buildTransformerAssetCompletion(clearance), supplement);
  else assert.throws(() => buildTransformerAssetCompletion(clearance), /requires independent approval|ENOENT/);
  assert.equal(Object.keys(baseAssets.geometry).length, 251);
  assert.equal(Object.keys(baseAssets.icons).length, 257);
  for (const channel of ['geometry', 'icons']) {
    for (const [id, asset] of Object.entries(baseAssets[channel])) assert.deepEqual(transformerRuntimeManifest[channel][id], asset);
    assert.equal(Object.keys(supplement[channel]).length, 25);
  }
  assert.equal(Object.keys(transformerRuntimeManifest.geometry).length, 276);
  assert.equal(Object.keys(transformerRuntimeManifest.icons).length, 282);
  assert.equal(Object.keys(transformerExecutionChoicesManifest.records).length, 36);
  assert.equal(Object.values(transformerExecutionChoicesManifest.records).reduce((sum, record) => sum + record.choiceIds.length, 0), 74);
  assert.deepEqual(transformerExecutionChoicesManifest.choices, baseChoices.choices);
  assert.equal(officialProducts.length, 843);
  assert.equal(transformerProducts.filter(row => Object.hasOwn(transformerRuntimeManifest.geometry, row.id) && getEquipmentVisual(row).type).length, 260);
  assert.equal(identityCompletionProducts.filter(row => getEquipmentVisual(row).type).length, 16);
  if (successorApproved) for (const [file, hash] of Object.entries(supplement.dependencies.reviewedFileHashes)) assert.equal(historicalDependencyHash(file), hash, file);
  else assert.throws(() => historicalDependencyHash('frontend/lib/catalog/models/visualMap.js'), /requires independent approval|ENOENT/);
});

test('copper has eight small and five large representative exteriors with the subsection inference disclosed', () => {
  for (const [type, powers, page] of [
    ['tr26-corrugated-small', [25, 40, 63, 100, 160, 250, 400, 630], 42],
    ['tr26-corrugated-large', [1000, 1250, 1600, 2000, 2500], 43],
  ]) for (const power of powers) {
    const row = byId.get(`alageum-tmg-copper-${power}`);
    for (const candidate of [row, api(row)]) {
      assert.equal(getEquipmentVisual(candidate).type, type);
      assert.equal(getEquipmentIcon(candidate).type, type);
      assert.deepEqual(getEquipmentVisual(candidate).sourcePages, [page]);
      assert.match(getEquipmentVisual(candidate).reason, /структуре подраздела/);
      assert.match(getEquipmentIcon(candidate).reason, /заказными/);
      assert.match(getEquipmentVisual(candidate).reason, /не моделируются/);
      assert.deepEqual(choices(candidate), []);
    }
    const asset = getReviewedTransformerAsset(row, 'geometry');
    assert.equal(asset.evidenceBasis, 'representative-subsection-inference');
    assert.equal(asset.representativeOnly, true);
    assert.equal(asset.dimensionAccurate, false); assert.equal(asset.exactMeshReuseAllowed, false);
  }
});

test('four additional TSL rows require an explicit open or cutaway choice and never acquire a default', () => {
  for (const level of ['a', 'c']) for (const power of [630, 1600]) {
    const row = byId.get(`alageum-2026-tsl-${level}-${power}`), snapshot = structuredClone(row);
    for (const candidate of [row, api(row)]) {
      assert.equal(getEquipmentVisual(candidate).type, null); assert.equal(getEquipmentIcon(candidate).type, null);
      assert.equal(select(candidate), null);
      assert.deepEqual(choices(candidate).map(choice => choice.id), ['dry-tsl-open-6-10', 'dry-tslz-enclosed-6-10']);
      const open = select(candidate, 'dry-tsl-open-6-10'), enclosed = select(candidate, 'dry-tslz-enclosed-6-10');
      assert.equal(open.geometryType, 'tr26-dry-cast-open'); assert.deepEqual(open.sourcePages, [80]);
      assert.equal(enclosed.geometryType, 'tr26-dry-mesh-cutaway'); assert.deepEqual(enclosed.sourcePages, [81]);
      assert.equal(enclosed.viewMode, 'illustrative-cutaway'); assert.match(enclosed.reason, /не определяет степень защиты/);
      assert.equal(select(candidate, 'dry-tsnz-mesh'), null);
    }
    assert.deepEqual(row, snapshot);
  }
});

test('callers cannot mutate the merged default allowlist or its source-page guards', () => {
  const row = byId.get('alageum-tmg-copper-630');
  const asset = getReviewedTransformerAsset(row, 'geometry');
  assert.throws(() => { asset.type = 'equipment'; }, TypeError);
  assert.throws(() => { asset.sourcePages.push(89); }, TypeError);
  assert.throws(() => { transformerRuntimeManifest.geometry['unreviewed'] = asset; }, TypeError);
  assert.equal(getReviewedTransformerAsset(row, 'geometry').type, 'tr26-corrugated-small');
});

test('all supplemental static and API bindings reject changed identity, source, raw media, units and record shape', () => {
  for (const row of rows) for (const original of [row, api(row)]) {
    const reject = value => {
      assert.equal(getReviewedTransformerAsset(value, 'geometry'), null, row.id);
      assert.equal(getReviewedTransformerAsset(value, 'icons'), null, row.id);
      assert.deepEqual(choices(value), [], row.id);
    };
    for (const key of Object.keys(JSON.parse(transformerRecordShape(original)))) {
      const changed = ['technicalSpecs', 'sourcePages', 'variantIds', 'notes', 'configurations'].includes(key) ? [{ changed: key }]
        : key === 'sourceRow' ? { changed: true } : 'changed-reviewed-value';
      reject({ ...original, [key]: changed });
    }
    reject({ ...original, technicalSpecs: original.technicalSpecs.map((spec, index) => index ? spec : { ...spec, unit: 'changed-unit' }) });
    reject({ ...original, source: 'unverified' });
    reject(Object.create(original));
    const cycle = { ...original, configurations: [] }; cycle.configurations.push(cycle); reject(cycle);
    if (original.source === 'api') {
      for (const databaseId of [null, '', '11111111-1111-5111-8111-111111111111', row.id]) reject({ ...original, databaseId });
      const noId = { ...original }; delete noId.databaseId; reject(noId);
      const noMedia = { ...original }; delete noMedia.sourceMediaPath; reject(noMedia);
      reject({ ...original, source: 'official' });
      const shown = { ...original, image: '/display-only-override.webp' };
      assert.deepEqual(getReviewedTransformerAsset(shown, 'geometry'), getReviewedTransformerAsset(original, 'geometry'));
      assert.deepEqual(choices(shown), choices(original));
    } else reject({ ...original, databaseId: recordApproval(row.id).database_id });
  }
  for (const id of ['__proto__', 'constructor', 'unknown', 'alageum-tmgi-x4k3-63', 'alageum-tmg-x3k2-63', 'ntmi-6', 'ntmi-10']) {
    const forged = { ...rows[0], id };
    assert.equal(getReviewedTransformerAsset(forged, 'geometry'), null); assert.deepEqual(choices(forged), []);
  }
});

test('supplemental approval rejects altered dependencies, captions, scope, choices, source hashes and API identities', () => {
  for (const mutate of [
    value => { value.status = 'candidate'; },
    value => { value.sourceId = 'other'; },
    value => { value.sourceSha256 = 'wrong'; },
    value => { value.inventorySha256 = 'wrong'; },
    value => { value.reviewReportSha256 = 'wrong'; },
    value => { value.counts.defaultRecords++; },
    value => { value.dependencies.reviewedFileHashes['frontend/lib/catalog/models/transformer2026Geometry.js'] = 'wrong'; },
    value => { delete value.dependencies.reviewedFileHashes['frontend/lib/catalog/models/transformer2026Shape.js']; },
    value => { delete value.dependencies.reviewedIntegrationAmendments['frontend/lib/catalog/models/transformer2026Runtime.js']; },
    value => { value.dependencies.reviewedIntegrationAmendments['frontend/lib/catalog/models/transformer2026Runtime.js'].historicalSha256 = 'wrong'; },
    value => { value.dependencies.reviewedIntegrationAmendments['frontend/lib/catalog/models/transformer2026Runtime.js'].reviewedSha256 = 'wrong'; },
    value => { value.dependencies.reviewedSourceImageHashes['/catalog-source/transformers-2026/page-042.webp'] = 'wrong'; },
    value => { value.records[0].sourceRecordId = 'ntmi-6'; },
    value => { value.records[0].database_id = 'wrong'; },
    value => { value.records[0].record_shape_sha256 = 'wrong'; },
    value => { value.records[0].mode = 'default'; },
    value => { value.records[0].choices[0].label = 'Unsupported'; },
    value => { value.records[0].choices[0].sourceCaption = 'Unsupported'; },
    value => { value.records[0].choices[0].reason = 'Exact CAD'; },
    value => { value.records[0].choices[0].geometryType = 'equipment'; },
    value => { value.records[0].choices[0].sourcePages = [89]; },
    value => { value.records[0].choices.pop(); },
    value => { value.records.push(value.records[0]); },
  ]) {
    const changed = structuredClone(clearance); mutate(changed);
    assert.throws(() => buildTransformerAssetCompletion(changed));
  }
});

test('historical release refuses pending forward approval; approved integration rejects later corruption and mismatched amendments', async () => {
  assert.throws(() => assertReviewedTransformerDependency('frontend/lib/catalog/models/transformer2026Geometry.js', 'unreviewed-geometry-hash', baseAssets), /Changed reviewed dependency/);
  assert.throws(() => assertReviewedTransformerDependency('frontend/lib/catalog/models/transformer2026Shape.js', 'unreviewed-shape-hash', baseAssets), /Changed reviewed dependency/);
  if (!successorApproved) {
    assert.throws(() => assertReviewedTransformerDependency('frontend/lib/catalog/models/transformer2026Runtime.js', baseAssets.reviewedLibraryHashes['frontend/lib/catalog/models/transformer2026Runtime.js'], baseAssets), /requires independent approval|ENOENT/);
    return;
  }
  const protectionPath = new URL(protectionContextClearancePath, root);
  const protectionClearance = fs.existsSync(protectionPath) ? JSON.parse(fs.readFileSync(protectionPath, 'utf8')) : null;
  if (protectionClearance?.status !== 'approved-bounded-protection-context') {
    assert.throws(() => assertReviewedTransformerDependency('frontend/lib/catalog/models/transformer2026Runtime.js', baseAssets.reviewedLibraryHashes['frontend/lib/catalog/models/transformer2026Runtime.js'], baseAssets), /requires independent approval|ENOENT/);
    return;
  }
  // Isolate intentional corruption from the shared checkout and parallel tests.
  // An approved successor adds its complete current verifier/dependency closure.
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'transformer-integration-guard-'));
  const verifier = 'scripts/catalog/transformer-reviewed-dependencies.mjs';
  const changedFile = 'frontend/lib/catalog/models/transformer2026Runtime.js';
  const clearanceFile = 'docs/catalog-transformers-2026/review/asset-completion/clearance.json';
  const write = (file, bytes) => { fs.mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true }); fs.writeFileSync(path.join(scratch, file), bytes); };
  const sourceClearance = JSON.parse(fs.readFileSync(new URL(sourceAssetClearancePath, root), 'utf8'));
  for (const file of new Set([verifier, changedFile, clearanceFile, clearance.reviewReport, sourceAssetClearancePath, sourceClearance.reviewReport,
    ...Object.keys(sourceClearance.dependencies.reviewedFiles), measurementColumnClearancePath, successorClearance.reviewReport,
    ...Object.keys(successorClearance.dependencies.reviewedFiles), protectionContextClearancePath, protectionClearance.reviewReport,
    ...Object.keys(protectionClearance.dependencies.reviewedFiles),
    ...browserRequiredFiles, browserClearancePath, browserReportPath,
    ...visualRequiredFiles, visualClearancePath, visualReportPath,
    ...ptmmRequiredFiles, ptmmClearancePath, ptmmReportPath,
    ...correctionRequiredFiles, correctionClearancePath, correctionReportPath,
    ...securityRequiredFiles(), securityClearancePath, securityReportPath,
    ...ktpbRequiredFiles(), ktpbClearancePath, ktpbReportPath,
    ...backendRequiredFiles(), backendClearancePath, backendReportPath,
    ...combinedRequiredFiles(), combinedClearancePath, combinedReportPath,
    ...jointRequiredFiles(), jointClearancePath, jointReportPath])) write(file, fs.readFileSync(new URL(file, root)));
  try {
    const { assertReviewedTransformerDependency: verify } = await import(pathToFileURL(path.join(scratch, verifier)).href);
    const original = fs.readFileSync(path.join(scratch, changedFile));
    const historical = baseAssets.reviewedLibraryHashes[changedFile];
    verify(changedFile, historical, baseAssets);
    fs.appendFileSync(path.join(scratch, changedFile), '\n');
    assert.throws(() => verify(changedFile, historical, baseAssets), /Changed joint-reviewed bytes|Changed unreviewed joint dependency|Changed combined-reviewed bytes|Changed unreviewed combined dependency|Changed amended integration dependency|Changed immutable source input frontend\/lib\/catalog\/models\/transformer2026Runtime\.js|Changed historical source approval\/dependency|Changed unamended PR33 dependency|Changed reviewed protection\/context file|Changed fixed PTMM browser correction dependency|Changed security-reviewed bytes|Changed unreviewed security dependency|Changed KTPB-reviewed bytes|Changed unreviewed KTPB dependency|Changed (?:backend-reviewed bytes|unreviewed backend dependency) frontend\/lib\/catalog\/models\/transformer2026Runtime\.js/);
    write(changedFile, original);
    assert.throws(() => verify(changedFile, 'wrong-old-hash', baseAssets), /Wrong historical integration dependency/);
    for (const mutate of [
      value => { delete value.dependencies.reviewedIntegrationAmendments[changedFile]; },
      value => { value.dependencies.reviewedIntegrationAmendments[changedFile].reviewedSha256 = 'wrong'; },
    ]) {
      const changed = structuredClone(clearance); mutate(changed); write(clearanceFile, JSON.stringify(changed));
      assert.throws(() => verify(changedFile, historical, baseAssets), /Changed joint-reviewed bytes|Changed unreviewed joint dependency|Changed combined-reviewed bytes|Changed unreviewed combined dependency|Changed approved integration dependencies|Changed immutable source input docs\/catalog-transformers-2026\/review\/asset-completion\/clearance\.json|Changed historical source approval\/dependency|Changed unamended PR33 dependency|Changed reviewed protection\/context file|Changed fixed PTMM browser correction dependency|Changed security-reviewed bytes|Changed unreviewed security dependency|Changed KTPB-reviewed bytes|Changed unreviewed KTPB dependency|Changed (?:backend-reviewed bytes|unreviewed backend dependency) docs\/catalog-transformers-2026\/review\/asset-completion\/clearance\.json/);
    }
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
});
