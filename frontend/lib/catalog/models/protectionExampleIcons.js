import { PTM_SOURCE_EXAMPLE_TYPE, TDE_SOURCE_EXAMPLE_TYPE, PAIRED_PROTECTION_EXAMPLE_ICON_TYPE, protectionExampleTypes, protectionExampleFamilyIconContext } from './protectionExampleTypes.js';

// Dedicated front-projection symbols. Small side-projection details and short
// under-cap segments are omitted; never turn uncertain features into roof posts.
const layer = (feature, d) => Object.freeze({ feature, d });
const front = (name, layers) => Object.freeze({
  name, layers: Object.freeze(layers), runtimeEligible: false,
  projection: 'simplified-source-front-only', exactProductIcon: false,
  disclosure: protectionExampleTypes[PTM_SOURCE_EXAMPLE_TYPE].disclosure,
});
const exemplarIcons = Object.freeze({
  [PTM_SOURCE_EXAMPLE_TYPE]: front(protectionExampleTypes[PTM_SOURCE_EXAMPLE_TYPE].name, [
    layer('overhanging-cap', 'M7 9h50v4H7z'),
    layer('closed-body', 'M8 16h48v34H8z'),
    layer('inset-front-panel', 'M12 19h40v28H12z'),
    layer('round-mark-upper', 'M18 23a2 2 0 1 0-4 0a2 2 0 1 0 4 0'),
    layer('round-mark-lower', 'M18 43a2 2 0 1 0-4 0a2 2 0 1 0 4 0'),
    layer('simplified-low-support-left', 'M8 50h7v4H8z'),
    layer('simplified-low-support-right', 'M49 50h7v4h-7z'),
  ]),
  [TDE_SOURCE_EXAMPLE_TYPE]: front(protectionExampleTypes[TDE_SOURCE_EXAMPLE_TYPE].name, [
    layer('closed-body', 'M8 11h48v41H8z'),
    layer('inset-front-panel', 'M13 15h38v33H13z'),
  ]),
});
export const protectionExampleIconDefinitions = Object.freeze({
  ...exemplarIcons,
  [PAIRED_PROTECTION_EXAMPLE_ICON_TYPE]: Object.freeze({
    name: 'ПТМ / ТДЕ: два примера со стр. 69', runtimeEligible: false, iconOnly: true,
    exactProductIcon: false, projection: 'paired-simplified-source-front-only',
    disclosure: protectionExampleFamilyIconContext.disclosure,
    components: Object.freeze([PTM_SOURCE_EXAMPLE_TYPE, TDE_SOURCE_EXAMPLE_TYPE]),
    // Composition of the exact front symbols only; no additional icon strokes.
    layers: Object.freeze([PTM_SOURCE_EXAMPLE_TYPE, TDE_SOURCE_EXAMPLE_TYPE].flatMap((type, index) => exemplarIcons[type].layers.map(item => Object.freeze({
      ...item, feature: `${index ? 'tde' : 'ptm'}-${item.feature}`,
      transform: `translate(${index ? 30 : 0} 16) scale(.56)`,
    })))),
  }),
});
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
export function renderProtectionExampleIcon(type, size = 64, title) {
  if (typeof type !== 'string' || !Object.hasOwn(protectionExampleIconDefinitions, type)) return null;
  if (!Number.isFinite(size) || size <= 0 || size > 2048) throw new RangeError('Icon size must be finite and between 0 and 2048');
  const definition = protectionExampleIconDefinitions[type];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"${title ? ` role="img" aria-label="${escape(title)}"` : ' aria-hidden="true"'}>${title ? `<title>${escape(title)}</title>` : ''}<desc>${escape(definition.disclosure)} Вид спереди; мелкие элементы бокового вида опущены.</desc>${definition.layers.map(item => `<path data-feature="${item.feature}" d="${item.d}"${item.transform ? ` transform="${item.transform}"` : ''}/>`).join('')}</svg>`;
}
