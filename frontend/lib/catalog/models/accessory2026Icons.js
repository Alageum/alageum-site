import { accessory2026Types, resolveAccessory2026Type } from './accessory2026Types.js';

const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h-${w}z`;
const circle = (x, y, r) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`;
const coil = Array.from({ length: 181 }, (_, i) => {
  const t = i / 180, angle = 2.5 - t * 5 * Math.PI, r = 11 + 5 * t;
  return `L${(39 + Math.cos(angle) * r).toFixed(2)} ${(27 - Math.sin(angle) * r).toFixed(2)}`;
}).join('');
const paths = {
  relay: [rect(9, 12, 46, 40), rect(6, 20, 50, 25), 'M14 16h35M14 49h35', rect(33, 25, 10, 8), rect(18, 25, 12, 8),
    ...[25, 29, 33, 37, 41].map(y => circle(12, y, .7)), ...[20, 22.7, 25.3, 28].map(x => circle(x, 30.5, .3)),
    ...[28, 36, 44].map(x => circle(x, 39, 1.6)), ...[28, 39].map(y => circle(50, y, 1.6))],
  probe: ['M6 39 16 27l3 2-10 13z', `M18 28L24 24${coil}Q55 45 48 54`, 'M48 54l-5 6m5-6-2 7m2-7 3 7'],
  damper: ['M12 40 6 46v5l25 8 27-25v-5l-5-2M6 46l25 8 27-25M31 54v5',
    'M12 42V29L36 7l17 6v19L29 51 12 45z',
    'M12 29l17 6L53 13M29 35v16',
    // Two curved seat edges descend to the middle along the long upper surface.
    'M17 27Q29 31 38 13M25 30Q36 34 47 16M17 27l8 3M38 13l9 3',
    'M15.7 49a2.3 1.2 0 1 0 4.6 0a2.3 1.2 0 1 0-4.6 0'],
};
export const accessory2026IconDefinitions = Object.freeze(Object.fromEntries(Object.entries(accessory2026Types).map(([type, definition]) => [type, Object.freeze({ name: definition.name, pages: definition.pages, paths: Object.freeze(paths[definition.build]), confidence: 'source-photo-exterior-proposal', exactProductIcon: false, runtimeEligible: false })])));
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
export function renderAccessory2026Icon(type, size = 64, title) {
  if (!resolveAccessory2026Type(type)) return null;
  if (!Number.isFinite(size) || size <= 0 || size > 2048) throw new RangeError('Icon size must be finite and between 0 and 2048');
  const definition = accessory2026IconDefinitions[type];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${title ? ` role="img" aria-label="${escape(title)}"` : ' aria-hidden="true"'}>${title ? `<title>${escape(title)}</title>` : ''}${definition.paths.map(path => `<path d="${path}"/>`).join('')}</svg>`;
}
