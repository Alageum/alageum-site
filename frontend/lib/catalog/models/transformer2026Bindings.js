import evidence from './transformer2026AssetEvidence.json' with { type: 'json' };
import { TRANSFORMER_2026_DISCLOSURE } from './transformer2026Types.js';
const deepFreeze = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) deepFreeze(child); Object.freeze(value); } return value; };
export const transformer2026AssetEvidence = deepFreeze(evidence);
export const transformer2026RecordProposals = Object.freeze(Object.fromEntries(evidence.records.map(record => [record.sourceRecordId, record])));
export const transformer2026EvidenceGroups = Object.freeze(Object.fromEntries(evidence.groups.map(group => [group.id, group])));
/** REVIEW-ONLY. Not imported by runtime catalogue/visualMap/iconMap. Explicit source-group
 * choices never imply SKU/rating inference. Independent source-table/identity review is
 * required before production cards can be created. Unknown rows cannot inherit assets. */
export function getTransformer2026ReviewAsset(recordOrId, choiceGroupId = null) {
  const id = typeof recordOrId === 'string' ? recordOrId : recordOrId?.id;
  const record = Object.hasOwn(transformer2026RecordProposals, id) ? transformer2026RecordProposals[id] : null;
  if (!record) return Object.freeze({ sourceRecordId: id || null, type: null, iconType: null, status: 'unknown-source-row', sourcePages: [], choices: [], fallbackKind: 'source-document', fallbackLabel: 'Нет подтвержденного изображения или 3D-модели конструкции', runtimeEligible: false });
  const allowChoice = ['topology-proposal', 'icon-only-proposal', 'execution-choice-required'].includes(record.status);
  const choice = !allowChoice ? null : choiceGroupId ? record.choices.find(entry => entry.groupId === choiceGroupId) : record.choices.length === 1 ? record.choices[0] : null;
  return Object.freeze({ sourceRecordId: id, type: choice?.geometryType || null, iconType: choice?.iconType || null, groupId: choice?.groupId || null, fallbackKind: choice ? null : 'source-document', fallbackLabel: choice ? null : 'Нет подтвержденного изображения или 3D-модели конструкции', status: choice && record.status === 'execution-choice-required' ? 'explicit-execution-proposal' : record.status, sourcePages: choice?.sourcePages || record.sourcePages, sourceImage: choice?.sourcePages.length ? `/catalog-source/transformers-2026/page-${String(choice.sourcePages[0]).padStart(3, '0')}.webp` : null, viewMode: choice?.viewMode || 'source-only', choices: record.choices, reasons: record.reasons, disclosure: TRANSFORMER_2026_DISCLOSURE, runtimeEligible: false, exactMeshReuseAllowed: false, dimensionAccurate: false, independentTableReviewRequired: true, candidateOldIds: record.candidateOldIds });
}
