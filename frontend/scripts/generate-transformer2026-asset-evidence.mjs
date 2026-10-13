import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformer2026GroupTypes, transformer2026GroupHolds, transformer2026GeometryHolds } from '../lib/catalog/models/transformer2026GroupMap.js';
import { transformer2026Types } from '../lib/catalog/models/transformer2026Types.js';
import { transformer2026IconDefinitions } from '../lib/catalog/models/transformer2026Icons.js';
import { readInventories, objectDigest } from '../../scripts/catalog/transformer-adapter.mjs';
const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const input = path.resolve(process.argv[2] || path.join(frontend, '../docs/catalog-transformers-2026/review'));
const groups = [], records = [], inputHashes = {};
const reviewedSections = readInventories(input);
for (const { section, inventory, assets } of reviewedSections) {
  inputHashes[`${section}/inventory-semantic`] = objectDigest(inventory);
  inputHashes[`${section}/asset-families-semantic`] = objectDigest(assets);
  const raw = assets;
  const families = Array.isArray(raw) ? raw : Object.values(raw).find(value => Array.isArray(value) && value[0] && typeof value[0] === 'object');
  for (const source of families) {
    if (!Object.hasOwn(transformer2026GroupTypes, source.id)) throw new Error(`Unreviewed source group ${source.id}`);
    const type = transformer2026GroupTypes[source.id], geometry = type && Object.hasOwn(transformer2026Types, type) && !Object.hasOwn(transformer2026GeometryHolds, source.id) ? type : null;
    groups.push({ id: source.id, section, name: source.title || source.description, sourcePages: source.evidencePages, sourceImages: source.evidencePages.map(page => `/catalog-source/transformers-2026/page-${String(page).padStart(3, '0')}.webp`), recordIds: source.modelIds || source.productIds || [], geometryType: geometry, iconType: type, reviewedPixels: true, reviewedAt: '2026-10-05', status: geometry ? 'topology-proposal' : type ? 'icon-only-proposal' : 'excluded', viewMode: type === 'tr26-dry-mesh-cutaway' ? 'illustrative-cutaway' : geometry ? 'illustrative-topology' : type ? 'illustrative-icon' : 'source-only', exactMeshReuseAllowed: false, dimensionAccurate: false, observations: transformer2026GeometryHolds[source.id] || (geometry ? transformer2026Types[type].observations : transformer2026GroupHolds[source.id]) || 'Наружный силуэт по фото. Без модели скрытых частей и без размерной реконструкции.', sourceRestrictions: [source.limit, source.justification, ...(source.reuseRestrictions || []), ...(source.reuseConditions || []), ...(source.exclusions || [])].filter(Boolean) });
  }
  for (const source of inventory.models) records.push({ source, section });
}
const rowProposals = records.map(({ source, section }) => {
  const declared = source.assetFamilyIds || (source.assetMapping?.assetFamilyId ? [source.assetMapping.assetFamilyId] : source.assetFamilyId ? [source.assetFamilyId] : []);
  const evidenceGroups = groups.filter(group => group.recordIds.includes(source.id));
  const inferredGroups = evidenceGroups.map(group => group.id);
  if (declared.length && declared.some(id => !inferredGroups.includes(id))) throw new Error(`Group membership mismatch ${source.id}: ${declared}`);
  const candidateOldIds = source.candidateOldIds || [], reasons = [], choices = evidenceGroups.filter(group => group.iconType).map(group => ({ groupId: group.id, geometryType: group.geometryType, iconType: group.iconType, sourcePages: group.sourcePages.filter(page => source.sourcePages.includes(page)), viewMode: group.viewMode }));
  let status = 'topology-proposal';
  if (!evidenceGroups.length) { status = 'source-evidence-needed'; reasons.push(source.assetMapping?.basis || (source.familyId?.startsWith('asia') || source.sourcePages.some(page => page >= 167) ? 'Нужны подписанные вид/план или фото конкретного обозначения и исполнения. Редакционные фото раздела Asia Trafo не подтверждают эту строку.' : 'Для этой строки нет однозначно привязанного чертежа или фото. Нужны точное обозначение исполнения и соответствующий общий вид.')); }
  else if (!choices.length) { status = 'source-evidence-needed'; reasons.push(...evidenceGroups.map(group => transformer2026GroupHolds[group.id])); }
  else if (choices.length > 1) { status = 'execution-choice-required'; reasons.push('Строка объединяет несколько конструктивных исполнений. Нельзя выбрать открытое/закрытое исполнение или один из кожухов без явного уточнения.'); }
  else if (!choices[0].geometryType) { status = 'icon-only-proposal'; const hold = transformer2026GeometryHolds[choices[0].groupId]; if (hold) reasons.push(hold); }
  if (source.assetMapping?.executionBindingUncertain) { if (status !== 'source-evidence-needed') status = 'execution-binding-unverified'; reasons.push(`Нужно подтвердить привязку подписи к исполнению: ${source.assetMapping.executionBinding || source.assetMapping.basis}`); }
  if (candidateOldIds.length) { status = 'old-identity-hold'; reasons.push('Есть кандидат существующей записи. Не создавать дубликат карточки и не заменять идентичность старого семейства без отдельной сверки.'); }
  if (status === 'topology-proposal' || status === 'icon-only-proposal') reasons.push('Предложение для проверки. Геометрия передает общую видимую компоновку; точное исполнение, размеры, число ребер и опции не подтверждаются моделью.');
  return { sourceRecordId: source.id, sourceFamilyId: source.familyId, section, designation: source.designation || source.name, sourcePages: source.sourcePages, sourceRow: source.sourceRow, candidateOldIds, evidenceGroupIds: inferredGroups, status, choices, selectedType: status === 'topology-proposal' ? choices[0].geometryType : null, selectedIconType: ['topology-proposal', 'icon-only-proposal'].includes(status) ? choices[0].iconType : null, runtimeEligible: false, independentTableReviewRequired: true, exactMeshReuseAllowed: false, dimensionAccurate: false, reasons };
});
const counts = { sourceRows: rowProposals.length, evidenceGroups: groups.length, geometryTypes: Object.keys(transformer2026Types).length, iconTypes: Object.keys(transformer2026IconDefinitions).length, groupsWithGeometry: groups.filter(group => group.geometryType).length, groupsWithIcon: groups.filter(group => group.iconType).length, sourceRowsWithGroup: rowProposals.filter(row => row.evidenceGroupIds.length).length, sourceRowsWithoutGroup: rowProposals.filter(row => !row.evidenceGroupIds.length).length, rowsWithGeometryChoice: rowProposals.filter(row => row.choices.some(choice => choice.geometryType)).length, heldOldIdentityRows: rowProposals.filter(row => row.candidateOldIds.length).length, statuses: Object.fromEntries([...new Set(rowProposals.map(row => row.status))].sort().map(status => [status, rowProposals.filter(row => row.status === status).length])) };
if (counts.sourceRows !== 540 || counts.evidenceGroups !== 87 || counts.heldOldIdentityRows !== 32) throw new Error(`Source inventory changed; review before regenerating: ${JSON.stringify(counts)}`);
const evidence = { schemaVersion: 1, sourceId: 'transformers-2026', sourceSha256: '8f27b781f1ff620ce2d67f606d6e115f2d0c35fbd31698f04c392a8ae611c70e', sourcePageCount: 187, reviewedAt: '2026-10-05', activation: 'staging-only', geometryPolicy: 'Visible topology proposals in arbitrary scene units; no exact product meshes, CAD, ratings-based scaling, hidden apparatus or dimensional claims. Never inherit these bindings to unknown source rows.', inputHashes, inventorySha256: objectDigest(reviewedSections.map(section => { const copy = structuredClone(section); if(copy.inventory.source?.filePath) delete copy.inventory.source.filePath; return copy; })), counts, groups, records: rowProposals };
await writeFile(path.join(frontend, 'lib/catalog/models/transformer2026AssetEvidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
const docs = path.join(frontend, '../docs/catalog-transformers-2026/assets'); await mkdir(docs, { recursive: true });
await writeFile(path.join(docs, 'coverage.json'), `${JSON.stringify({ sourceSha256: evidence.sourceSha256, counts, records: rowProposals }, null, 2)}\n`);
console.log(JSON.stringify(counts, null, 2));
