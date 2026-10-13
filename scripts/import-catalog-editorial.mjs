#!/usr/bin/env node
// Local file-backed catalog update. Never connects to SQL, starts Strapi or publishes media.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

export const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const digest = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(canonical(value))).digest('hex');
const json = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const stringify = value => JSON.stringify(value, null, 2) + '\n';
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const rootDefault = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adapterFiles = ['frontend/lib/catalog/data.js', 'frontend/lib/catalog/presentation.js', 'frontend/lib/catalog/grouping.js', 'frontend/lib/catalog/catalogEditorial.js', 'frontend/lib/catalog/catalogEditorialOverlay.json'];

export function safePath(base, relative) {
  const result = path.resolve(base, relative);
  if (result !== base && !result.startsWith(base + path.sep)) throw Error('Unsafe package path: ' + relative);
  return result;
}
export function readPackage(input) {
  const checks = json(path.join(input, 'checksums.json'));
  if (checks.algorithm !== 'sha256' || checks.fileCount !== checks.files.length) throw Error('Invalid checksums index');
  for (const entry of checks.files) {
    const file = safePath(input, entry.path), bytes = fs.readFileSync(file);
    if (bytes.length !== entry.bytes || digest(bytes) !== entry.sha256) throw Error('Checksum mismatch: ' + entry.path);
  }
  const overlay = json(path.join(input, 'catalog-display-overlay.json'));
  const original = json(path.join(input, 'catalog-original-843.json'));
  const baseline = json(path.join(input, 'display-baseline-843.json'));
  if (digest(fs.readFileSync(path.join(input, 'catalog-original-843.json'))) !== overlay.sourceSnapshotSha256 || digest(fs.readFileSync(path.join(input, 'display-baseline-843.json'))) !== overlay.displayBaselineSha256) throw Error('Source snapshot binding mismatch');
  const hierarchy = json(path.join(input, 'names-variants/catalog-hierarchy.json'));
  const variants = json(path.join(input, overlay.nameVariantData));
  const configurations = json(path.join(input, 'names-variants/configuration-source-options.json'));
  const candidates = json(path.join(input, overlay.photoManifest));
  const coverage = json(path.join(input, overlay.photoCoverage));
  const ids = new Set(original.map(r => r.id));
  for (const [label, rows, key] of [['source', original, 'id'], ['display', overlay.records, 'id'], ['baseline', baseline, 'id'], ['variants', variants.records, 'productId'], ['coverage', coverage, 'productId']]) {
    if (rows.length !== 843 || new Set(rows.map(r => r[key])).size !== 843 || rows.some(r => !ids.has(r[key]))) throw Error('ID mismatch: ' + label);
  }
  const sources = new Map(original.map(r => [r.id, r]));
  for (const row of overlay.records) if (digest(sources.get(row.id)) !== row.sourceRecordSha256) throw Error('Source record binding mismatch: ' + row.id);
  for (const row of variants.records) if (digest(sources.get(row.productId)) !== row.sourceRecordSha256) throw Error('Variant binding mismatch: ' + row.productId);
  const modelKeys = new Set(hierarchy.models.map(r => r.modelKey));
  const familyKeys = new Set(hierarchy.families.map(r => r.familyKey));
  if (modelKeys.size !== hierarchy.models.length || familyKeys.size !== hierarchy.families.length) throw Error('Duplicate hierarchy keys');
  for (const f of hierarchy.families) {
    if ([...f.recordIds, ...f.childRecordIds].some(id => !ids.has(id)) || f.modelKeys.some(key => !modelKeys.has(key))) throw Error('Broken family reference: ' + f.familyKey);
    if (f.catalogFamilyRecordId && !ids.has(f.catalogFamilyRecordId)) throw Error('Missing family product');
  }
  for (const model of hierarchy.models) if (!familyKeys.has(model.familyKey) || model.recordIds.some(id => !ids.has(id))) throw Error('Broken model reference');
  let configurationOccurrences = 0;
  for (const option of configurations) {
    if (digest(option.originalObject) !== option.originalObjectSha256 || option.isOrderableSku !== false) throw Error('Invalid configuration authority');
    for (const occurrence of option.sourceOccurrences) {
      const match = /^configurations\[(\d+)\]$/.exec(occurrence.fieldPath);
      const config = match && sources.get(occurrence.productId)?.configurations?.[Number(match[1])];
      if (!config || digest(config) !== option.originalObjectSha256) throw Error('Broken configuration occurrence');
      configurationOccurrences++;
    }
  }
  if (configurations.length !== 501 || configurationOccurrences !== 1351) throw Error('Configuration coverage mismatch');
  const candidateMap = new Map(candidates.map(c => [c.candidateId, c]));
  if (candidateMap.size !== candidates.length) throw Error('Duplicate candidate IDs');
  const assets = new Map();
  function registerAsset(asset) {
    const source = path.resolve(input, 'photos-increment-05', asset.localFile);
    if (!source.startsWith(input + path.sep)) throw Error('Unsafe asset path');
    const bytes = fs.readFileSync(source);
    if (digest(bytes) !== asset.sha256) throw Error('Asset checksum mismatch: ' + asset.localFile);
    const extension = path.extname(source).toLowerCase();
    if (!['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(extension)) throw Error('Unsupported image format');
    assets.set(asset.sha256, { sha256: asset.sha256, source, relative: `assets/${asset.sha256}${extension}`, bytes: bytes.length });
  }
  for (const c of candidates) {
    registerAsset(c);
    for (const alternative of c.assetAlternatives || []) registerAsset(alternative);
    if (![...c.effectiveProductMappings.map(r => r.productId), ...c.effectiveTypeReferenceProductIds].every(id => ids.has(id))) throw Error('Broken effective media reference');
  }
  const associations = [];
  const associationKeys = new Set();
  for (const row of coverage) {
    const declared = [...row.photoMatches, ...(row.videoFrameMatches || []), ...row.typeReferenceCandidateIds.map(candidateId => ({ candidateId, modelMatch: 'type_reference', mediaKind: candidateMap.get(candidateId)?.mediaKind }))];
    for (const match of declared) {
      const candidate = candidateMap.get(match.candidateId);
      if (!candidate || match.mediaKind !== candidate.mediaKind) throw Error('Media kind mismatch');
      const effective = candidate.effectiveProductMappings.find(m => m.productId === row.productId);
      if (match.modelMatch === 'type_reference' ? !candidate.effectiveTypeReferenceProductIds.includes(row.productId) : !effective || effective.level !== match.modelMatch) throw Error('Media authority mismatch');
      const key = `${row.productId}:${match.candidateId}:${match.modelMatch}`;
      if (associationKeys.has(key)) throw Error('Duplicate photo association');
      associationKeys.add(key);
      associations.push({ productId: row.productId, candidateId: match.candidateId, level: match.modelMatch, mediaKind: candidate.mediaKind, limitations: match.limitations || match.matchNotes || candidate.notes, publicationStatus: 'held_pending_rights_and_correspondence' });
    }
  }
  for (const row of overlay.records) for (const change of row.voltageChanges) {
    const tokens = value => String(value).match(/\d+(?:[.,]\d+)?/g) || [];
    if (JSON.stringify(tokens(change.original)) !== JSON.stringify(tokens(change.proposed))) throw Error('Voltage numeric token changed: ' + row.id);
  }
  return { checks, overlay, original, baseline, hierarchy, variants, configurations, candidates, coverage, assets: [...assets.values()], associations, packageDigest: digest(fs.readFileSync(path.join(input, 'checksums.json'))) };
}

export function planImport(pkg, current, currentDisplay, previous = { records: {} }) {
  const currentMap = new Map(current.map(r => [r.id, r]));
  if (currentMap.size !== current.length) throw Error('Duplicate IDs in current catalog');
  const displayMap = new Map(currentDisplay.map(r => [r.id, r]));
  const baselineMap = new Map(pkg.baseline.map(r => [r.id, r]));
  const sourceMap = new Map(pkg.original.map(r => [r.id, r]));
  const conflicts = [], missing = [], records = { ...previous.records };
  const configurationMap = new Map();
  for (const option of pkg.configurations) for (const occurrence of option.sourceOccurrences) {
    const list = configurationMap.get(occurrence.productId) || [];
    list.push({ configurationKey: option.configurationKey, configurationId: option.configurationId, fieldPath: occurrence.fieldPath, originalObjectSha256: option.originalObjectSha256, displayLabel: option.displayLabel, modelId: option.modelId, applicability: occurrence.applicability });
    configurationMap.set(occurrence.productId, list);
  }
  const familyChildren = new Map(pkg.hierarchy.families.filter(f => f.catalogFamilyRecordId).map(f => [f.catalogFamilyRecordId, f.childRecordIds]));
  const counts = { sourceRecordsMatched: 0, recordsChanged: 0, recordsUnchanged: 0, namesChanged: 0, executionsChanged: 0, voltageChanged: 0 };
  for (const row of pkg.overlay.records) {
    const product = currentMap.get(row.id);
    if (!product) { missing.push(row.id); continue; }
    const { catalogEditorial: ignored, ...raw } = product;
    if (digest(raw) !== row.sourceRecordSha256) {
      const source = sourceMap.get(row.id);
      conflicts.push({ id: row.id, reason: 'source_record_changed', fields: [...new Set([...Object.keys(raw), ...Object.keys(source)])].filter(key => digest(raw[key] ?? null) !== digest(source[key] ?? null)) });
      continue;
    }
    counts.sourceRecordsMatched++;
    const proposed = {};
    const keys = ['sourceRecordSha256','displayName','displayLabel','displayDesignation','displayExecution','designationScope','needsNameDecision','voltageDisplay','voltageCompact','voltageValues','voltageEvidence','voltageSourceRows','voltageUnitProvenance','sourceNotes','group_keys','displayRecordRole','sameMarkingIds','requiresVariantContextWhenShowingOnlyMarking','namingAmbiguityFlags','distinguishingAttributes'];
    for (const key of keys) if (own(row, key)) proposed[key] = row[key];
    proposed.originalFullName = row.originalName;
    proposed.navigationChildIds = familyChildren.get(row.id) || [];
    proposed.configurationOptions = configurationMap.get(row.id) || [];
    const before = previous.records?.[row.id];
    if (before && digest(before) !== digest(proposed)) {
      // Never replace an edited previous supplement with a new package automatically.
      conflicts.push({ id: row.id, reason: 'editorial_values_changed', fields: [...new Set([...Object.keys(before), ...Object.keys(proposed)])].filter(key => digest(before[key] ?? null) !== digest(proposed[key] ?? null)) });
      continue;
    }
    if (!before) {
      const baseline = baselineMap.get(row.id), display = displayMap.get(row.id);
      if (!display || digest(display) !== digest(baseline)) {
        conflicts.push({ id: row.id, reason: 'display_baseline_changed' }); continue;
      }
    }
    if (before && digest(before) === digest(proposed)) counts.recordsUnchanged++;
    else {
      counts.recordsChanged++;
      const old = displayMap.get(row.id);
      if (old.displayName !== proposed.displayName) counts.namesChanged++;
      if (old.displayExecution !== proposed.displayExecution) counts.executionsChanged++;
      if ((old.voltageSummary?.value || '—') !== proposed.voltageDisplay) counts.voltageChanged++;
    }
    records[row.id] = proposed;
  }
  return { overlay: { format: 'alageum-catalog-editorial-v1', generation: pkg.packageDigest, sourceSnapshotSha256: pkg.overlay.sourceSnapshotSha256, records }, counts, conflicts, missing, extraIdsPreserved: current.filter(r => !sourceMap.has(r.id)).map(r => r.id) };
}

const writeAtomic = (file, value) => {
  const temporary = file + `.tmp-${randomUUID()}`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
  const directory = fs.openSync(path.dirname(file), 'r'); try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
};

async function readCurrent(root) {
  const lib = path.join(root, 'frontend/lib/catalog');
  const { officialProducts, demoProducts } = await import(pathToFileURL(path.join(lib, 'data.js')));
  const { displayProductName, displayExecution } = await import(pathToFileURL(path.join(lib, 'presentation.js')));
  const { getCatalogSpecSummary, compactCatalogSpecValue } = await import(pathToFileURL(path.join(lib, 'grouping.js')));
  const display = officialProducts.map(product => {
    const voltage = getCatalogSpecSummary(product, officialProducts).find(r => r.key === 'voltage');
    return JSON.parse(JSON.stringify({ id: product.id, displayName: displayProductName(product), displayExecution: displayExecution(product), voltageSummary: voltage, voltageCompact: compactCatalogSpecValue(voltage) }));
  });
  return { products: officialProducts, display, demoProducts };
}

export async function runImport({ root = rootDefault, input, work, apply = false }) {
  if (!input || !work) throw Error('Explicit input and work directories required');
  if (process.env.APP_ENV === 'production') throw Error('Production environment refused');
  const pkg = readPackage(input);
  const current = await readCurrent(root);
  const activePath = path.join(root, 'frontend/lib/catalog/catalogEditorialOverlay.json');
  const previousBytesHash = digest(fs.readFileSync(activePath));
  const previous = json(activePath);
  const plan = planImport(pkg, current.products, current.display, previous);
  const report = { mode: apply ? 'apply' : 'dry-run', target: 'local-file-backed-catalog', packageDigest: pkg.packageDigest, ...plan.counts, conflicts: plan.conflicts, missingIds: plan.missing, extraIdsPreserved: plan.extraIdsPreserved, demoRecordsPreserved: current.demoProducts.length, photosPublished: 0, visualCandidates: pkg.candidates.length, privateAssets: pkg.assets.length, photoAssociations: pkg.associations.length, backup: path.join(work, 'backup/catalog-before-import.tar.gz') };
  if (!apply) { writeAtomic(path.join(work, 'import-dry-run.json'), report); return report; }
  if (!fs.existsSync(report.backup)) throw Error('Backup required before apply');
  if (plan.counts.recordsChanged === 0 && digest(previous) === digest(plan.overlay)) {
    report.idempotentNoop = true; writeAtomic(path.join(work, 'repeat-import-report.json'), report); return report;
  }
  const privateRoot = path.join(root, 'backend-node/data/catalog-editorial');
  fs.mkdirSync(privateRoot, { recursive: true, mode: 0o700 }); fs.chmodSync(privateRoot, 0o700);
  const lock = path.join(privateRoot, '.import-lock');
  const lockFd = fs.openSync(lock, 'wx', 0o600);
  let stage;
  try {
    // A concurrent source edit invalidates the preflight rather than getting overwritten.
    const sourceInventory = json(path.join(work, 'backup/file-sha256.json'));
    for (const [relative, expected] of Object.entries(sourceInventory)) {
      if (adapterFiles.includes(relative)) continue;
      if (digest(fs.readFileSync(path.join(root, relative))) !== expected) throw Error('Source changed since backup: ' + relative);
    }
    const beforeDir = path.join(work, 'backup/editable-before');
    fs.mkdirSync(beforeDir, { recursive: true });
    const oldFiles = adapterFiles.filter(f => own(sourceInventory, f));
    if (!fs.existsSync(path.join(beforeDir, oldFiles[0]))) {
      const extraction = spawnSync('tar', ['-xzf', report.backup, '-C', beforeDir, ...oldFiles], { encoding: 'utf8' });
      if (extraction.status) throw Error('Cannot prepare targeted rollback');
    }
    const final = path.join(privateRoot, 'releases', pkg.packageDigest);
    fs.mkdirSync(path.dirname(final), { recursive: true });
    if (!fs.existsSync(final)) {
      stage = final + `.staging-${randomUUID()}`;
      fs.mkdirSync(path.join(stage, 'assets'), { recursive: true, mode: 0o700 });
      fs.mkdirSync(path.join(stage, 'evidence'), { mode: 0o700 });
      for (const asset of pkg.assets) {
        const target = path.join(stage, asset.relative);
        fs.copyFileSync(asset.source, target, fs.constants.COPYFILE_EXCL); fs.chmodSync(target, 0o600);
        if (digest(fs.readFileSync(target)) !== asset.sha256) throw Error('Staged asset corruption');
      }
      const evidence = pkg.checks.files.filter(entry => /\.(json|csv|txt|md)$/.test(entry.path));
      for (const entry of evidence) {
        const target = path.join(stage, 'evidence', entry.path); fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(safePath(input, entry.path), target); fs.chmodSync(target, 0o600);
      }
      fs.copyFileSync(path.join(input, 'checksums.json'), path.join(stage, 'evidence/checksums.json'));
      writeAtomic(path.join(stage, 'photos.json'), { candidates: pkg.candidates.map(c => ({ ...c, privateAsset: pkg.assets.find(a => a.sha256 === c.sha256).relative, assetAlternatives: (c.assetAlternatives || []).map(a => ({ ...a, privateAsset: pkg.assets.find(asset => asset.sha256 === a.sha256).relative, importPublicationStatus: 'held_pending_rights_and_correspondence' })), importPublicationStatus: 'held_pending_rights_and_correspondence' })), associations: pkg.associations, coverage: pkg.coverage });
      writeAtomic(path.join(stage, 'hierarchy.json'), pkg.hierarchy);
      writeAtomic(path.join(stage, 'configurations.json'), pkg.configurations);
      writeAtomic(path.join(stage, 'variant-identity.json'), pkg.variants);
      writeAtomic(path.join(stage, 'products.json'), current.products.map(product => { const { catalogEditorial, ...raw } = product; return plan.overlay.records[product.id] ? { ...raw, catalogEditorial: plan.overlay.records[product.id] } : product; }));
      writeAtomic(path.join(stage, 'manifest.json'), { format: 'alageum-private-catalog-update-v1', packageDigest: pkg.packageDigest, assets: pkg.assets.map(({ source, ...asset }) => asset), evidence: evidence.map(({ path: relative, ...entry }) => ({ path: `evidence/${relative}`, ...entry })), photosPublished: 0, originalTechnicalRecordIds: current.products.map(r => r.id) });
      fs.renameSync(stage, final); stage = null;
    }
    // Persist the rollback plan before the single commit point.
    if (digest(fs.readFileSync(activePath)) !== previousBytesHash) throw Error('Concurrent editorial edit; activation refused');
    const journal = { state: 'prepared', packageDigest: pkg.packageDigest, backup: report.backup, privateRelease: final, files: adapterFiles.map(relative => ({ relative, beforeExists: own(sourceInventory, relative), beforeSha256: sourceInventory[relative] || null, afterSha256: relative === 'frontend/lib/catalog/catalogEditorialOverlay.json' ? digest(stringify(plan.overlay)) : digest(fs.readFileSync(path.join(root, relative))) })) };
    writeAtomic(path.join(work, 'rollback-journal.json'), journal);
    // All editorial records become visible together; immutable media remains private.
    writeAtomic(activePath, plan.overlay);
    report.committed = true; report.privateRelease = final;
    journal.state = 'committed';
    writeAtomic(path.join(work, 'rollback-journal.json'), journal);
    writeAtomic(path.join(work, 'import-result.json'), report);
    return report;
  } finally {
    if (stage) fs.rmSync(stage, { recursive: true, force: true });
    fs.closeSync(lockFd); fs.unlinkSync(lock);
  }
}

export function rollbackImport({ root = rootDefault, work }) {
  const journal = json(path.join(work, 'rollback-journal.json'));
  if (!['prepared', 'committed'].includes(journal.state)) throw Error('No committed import to roll back');
  for (const item of journal.files) if (digest(fs.readFileSync(path.join(root, item.relative))) !== item.afterSha256) throw Error('Later manual change; rollback refused: ' + item.relative);
  const restoreFiles = journal.files.filter(r => r.beforeExists).map(item => {
    const bytes = fs.readFileSync(path.join(work, 'backup/editable-before', item.relative));
    if (digest(bytes) !== item.beforeSha256) throw Error('Rollback backup corruption');
    return { ...item, bytes };
  });
  const active = path.join(root, 'frontend/lib/catalog/catalogEditorialOverlay.json');
  // Disable the supplement first; retained immutable generations are intentionally not deleted.
  writeAtomic(active, { format: 'alageum-catalog-editorial-v1', generation: null, records: {} });
  for (const item of restoreFiles) {
    const target = path.join(root, item.relative), temp = target + '.rollback';
    fs.writeFileSync(temp, item.bytes); fs.renameSync(temp, target);
  }
  for (const item of journal.files.filter(r => !r.beforeExists)) fs.unlinkSync(path.join(root, item.relative));
  journal.state = 'rolled-back'; writeAtomic(path.join(work, 'rollback-journal.json'), journal);
  return { rolledBack: true, privateAssetsRetainedForAudit: journal.privateRelease };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), get = flag => args[args.indexOf(flag) + 1];
  const root = args.includes('--root') ? path.resolve(get('--root')) : rootDefault;
  const work = args.includes('--work') ? path.resolve(get('--work')) : null;
  if (args.some(arg => ['--production','--deploy','--database-url'].includes(arg))) throw Error('Only a local file-backed target is supported');
  const result = args.includes('--rollback') ? rollbackImport({ root, work }) : await runImport({ root, work, input: path.resolve(get('--input')), apply: args.includes('--apply') });
  console.log(JSON.stringify(result, null, 2));
}
