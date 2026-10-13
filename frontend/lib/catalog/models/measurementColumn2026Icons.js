import { measurementColumn2026Types, MEASUREMENT_COLUMN_2026_TYPE, resolveMeasurementColumn2026Type } from './measurementColumn2026Types.js';

// Hand-drawn vector vocabulary. The oblique cover is widened for small icons;
// it preserves four-left / one-right positions, not dimensional proportions.
const ellipse = (x, y, rx, ry) => `M${x - rx} ${y}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 -${2 * rx} 0`;
const layer = (feature, d, solid = false) => Object.freeze({ feature, d, solid });
const bushing = (x, y, position) => [
  layer(`cover-bushing-${position}`, `M${x - 1.7} ${y}v-1.1l.5-.6v-1.4h2.4v1.4l.5.6V${y}q-1.7 1-3.4 0z`, true),
  layer(`cover-contact-${position}`, `M${x} ${y - 3.1}v-1.4`),
];
const layers = [
  layer('opaque-tank', 'M12 40 42 35l10 9v8l-3.5 6-28 4-8.5-7z', true),
  layer('tank-taper-seams', 'M21 47v9l1.8 5M21 56l27.5-4M42 35v9'),
  layer('low-base', 'M20 62l30-4'),
  layer('rectangular-cover', 'M9 41 44 36l11 9-35 6z', true),
  layer('rear-lifting-ear', 'M14 40v-4l1.4-1 2.3 1.7v4', true),
  ...bushing(19.4, 41.0, 'upper-left'),
  ...bushing(19, 44.5, 'mid-left'),
  layer('column-collar', 'M26 41v-2h12v2q-6 2.2-12 0z', true),
  layer('visible-flange', ellipse(32, 38.7, 7, 1.45), true),
  layer('continuous-column-core', 'M29 14h6v24.5h-6z', true),
  ...[33, 29, 25, 21, 17].map((y, index) => layer(`major-shed-${5 - index}`, `M29 ${y - 2}q-.5 1.2-3.8 2.1q-1 .9.3 1.4q6.5 1.7 13 0q1.3-.5.3-1.4q-3.3-.9-3.8-2.1z`, true)),
  layer('upper-chamber', 'M25.2 7.8q6.8-2.4 13.6 0v7q-6.8 2.5-13.6 0z', true),
  layer('chamber-top', ellipse(32, 7.8, 6.8, 1.5), true),
  layer('side-level-indicator', 'M26.7 10v3.7'),
  layer('offset-plug', 'M35.1 7V5.5h2.2V7', true),
  layer('central-top-contact', 'M30.7 7h2.6M32 6.9V2.5m-1 .8h2'),
  ...bushing(22.1, 48, 'lower-left-outer'),
  ...bushing(25.6, 47.5, 'lower-left-inner'),
  ...bushing(46, 42, 'mid-right'),
  layer('near-lifting-ear', 'M48 47.5v-4.4l1.2-1 2.4 1.7V47', true),
];
export const measurementColumn2026IconDefinitions = Object.freeze({
  [MEASUREMENT_COLUMN_2026_TYPE]: Object.freeze({
    name: measurementColumn2026Types[MEASUREMENT_COLUMN_2026_TYPE].name,
    pages: measurementColumn2026Types[MEASUREMENT_COLUMN_2026_TYPE].pages,
    layers: Object.freeze(layers),
    confidence: 'source-context-exterior-candidate', runtimeEligible: false, exactProductIcon: false,
    limits: 'Stylised oblique view; widened cover and omitted tiny fittings. Count and asymmetric layout retained; electrical roles unverified.',
  }),
});
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
export function renderMeasurementColumn2026Icon(type, size = 64, title) {
  if (!resolveMeasurementColumn2026Type(type)) return null;
  if (!Number.isFinite(size) || size <= 0 || size > 2048) throw new RangeError('Icon size must be finite and between 0 and 2048');
  const definition = measurementColumn2026IconDefinitions[type];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"${title ? ` role="img" aria-label="${escape(title)}"` : ' aria-hidden="true"'}>${title ? `<title>${escape(title)}</title>` : ''}<g transform="translate(2 1) scale(.94)">${definition.layers.map(item => `<path data-feature="${item.feature}" d="${item.d}"${item.solid ? ' fill="var(--equipment-icon-surface, #fff)"' : ''}/>`).join('')}</g></svg>`;
}
