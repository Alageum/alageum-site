import { getProtectionExampleAsset, getRejectedProtectionExampleAsset } from './protectionExampleRuntime.js';
import { getMeasurementColumn2026Completion } from './measurementColumn2026Completion.js';
import { getSourceAssetCompletion } from './sourceAssetCompletion.js';
import { getReviewedTransformerAsset, isTransformer2026Record } from './transformer2026Runtime.js';
import { equipmentVisualAudit, getEquipmentVisual } from './visualMap.js';
import { sourceIconMapA, sourceIconVariantMapA } from './sourceIconMapA.js';
import { sourceIconMapB, sourceIconVariantMapB } from './sourceIconMapB.js';
import { getReviewedLegacyCompletion } from './legacyAssetCompletion.js';

/** Separate evidence for readable listing icons; the model audit stays unchanged. */
export const equipmentIconAudit = Object.freeze({ ...sourceIconMapA, ...sourceIconMapB });
export const equipmentIconVariantAudit = Object.freeze({ ...sourceIconVariantMapA, ...sourceIconVariantMapB });
export const iconConfidenceLabel = icon => icon.confidence === 'source-based'
  ? 'Иконка по иллюстрации серии; не точный чертёж исполнения'
  : 'Условная схема типа; внешний вид исполнения не подтверждён';

export function getEquipmentIcon(product = {}) {
  const protectionExample = getProtectionExampleAsset(product, 'icons');
  if (protectionExample) return protectionExample;
  const rejectedProtectionExample = getRejectedProtectionExampleAsset(product, 'icons');
  if (rejectedProtectionExample) return rejectedProtectionExample;
  const columnCompletion = getMeasurementColumn2026Completion(product, 'icons');
  if (columnCompletion) return columnCompletion;
  const sourceCompletion = getSourceAssetCompletion(product, 'icons');
  if (sourceCompletion) return sourceCompletion;
  const completion = getReviewedLegacyCompletion(product, 'icons');
  if (completion) return completion;
  if (isTransformer2026Record(product)) {
    const asset = getReviewedTransformerAsset(product, 'icons');
    return { type: asset?.type || null, confidence: asset ? 'source-based' : 'source-only', sourceFamilyId: product.familyId || product.id, sourcePages: asset?.sourcePages || product.sourcePages || [], sourceImage: asset?.sourceImage || product.image || null, reason: asset ? (asset.reason || 'Иконка по проверенной видимой конструкции; не точный чертёж исполнения') : 'Документ источника; изображение конструкции не подтверждено' };
  }
  const visual = getEquipmentVisual(product);
  const familyId = product.familyId || product.id;
  const imported = product.sourceKind === 'supplied-pdf';
  const family = imported && Object.hasOwn(equipmentIconAudit, familyId) ? equipmentIconAudit[familyId] : null;
  const override = imported && Object.hasOwn(equipmentIconVariantAudit, product.id) ? equipmentIconVariantAudit[product.id] : null;
  if (family || override) {
    const icon = override || family;
    const inheritedApproximation = product.recordKind === 'variant' && !override && !family.inherit;
    return {
      type: icon.type,
      confidence: inheritedApproximation ? 'typical' : icon.confidence,
      reason: inheritedApproximation
        ? `Условная иконка по общей иллюстрации семейства; конструкция этого обозначения отдельно не подтверждена. ${icon.reason}`
        : icon.reason,
      sourceFamilyId: familyId,
      sourcePages: [...(icon.sourcePages || visual.sourcePages)],
      sourceImage: visual.fallbackImage || product.image || null,
    };
  }
  // Previously audited source-matched constructions retain their existing icons.
  if (visual.type && visual.confidence === 'source-matched') {
    return {
      type: visual.type,
      confidence: 'source-based',
      reason: visual.reason,
      sourceFamilyId: familyId,
      sourcePages: [...visual.sourcePages],
      sourceImage: visual.fallbackImage,
    };
  }
  return {
    type: visual.type || 'equipment',
    confidence: 'typical',
    reason: visual.reason,
    sourceFamilyId: imported && Object.hasOwn(equipmentVisualAudit, familyId) ? familyId : null,
    sourcePages: [...visual.sourcePages],
    sourceImage: visual.fallbackImage || product.image || null,
  };
}
