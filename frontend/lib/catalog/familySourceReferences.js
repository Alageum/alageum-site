import { getFamilyPresentationEvidence } from './familyPresentation.js';
import { getCatalogSourceComparisons } from './identityCompletion.js';

const supportedFamilies = new Set(['tmg-standard', 'tmgs-pole', 'tmgf', 'tmeg', 'dry-accessories']);
export const sourcePanelAnchor = panelId => `source-panel-${panelId}`;

/** References to source comparisons, never members, aliases, or additional specification evidence.
 * Both the family and each currently available canonical target must pass their existing guards.
 */
export function getCatalogFamilySourceReferences(family, records = []) {
  if (!family || !supportedFamilies.has(family.sourceFamilyId) || !getFamilyPresentationEvidence(family) || !Array.isArray(records)) return [];
  const references = new Map();
  for (const target of records) {
    if (!target || target.source !== family.source) continue;
    for (const panel of getCatalogSourceComparisons(target)) {
      if (panel.representation !== 'source-comparison' || panel.canonicalId !== target.id
        || panel.sourceFamilyId !== family.sourceFamilyId || panel.sourceId !== family.sourceId
        || panel.sourceFileId !== family.sourceFileId || panel.sourceSha256 !== family.sourceSha256
        || !panel.sourcePages.every(page => family.sourcePages.includes(page))) continue;
      references.set(panel.id, {
        familyId: family.id,
        canonicalId: target.id,
        panelId: panel.id,
        designation: panel.designation,
        sourcePages: [...panel.sourcePages],
        anchorId: sourcePanelAnchor(panel.id),
        href: `/catalog/${encodeURIComponent(target.id)}${family.source === 'api' ? '?source=api' : ''}#${sourcePanelAnchor(panel.id)}`,
      });
    }
  }
  return [...references.values()];
}
