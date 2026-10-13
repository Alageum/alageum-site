/** Per-page visible exterior layouts from the reviewed source plans.
 * Negative z is the upper side of the printed plan; x increases to its right.
 * Centers/widths/heights are illustrative proportions, never source dimensions.
 * Counts mean separate radiator units, not the number of individual cooling fins.
 */
const locations = {
  central1: [[.1], .28], right1: [[.32], .25], central2: [[-.16, .16], .27], right2: [[.1, .37], .23], left2: [[-.28, -.01], .23], gap2: [[-.3, .3], .2],
  full3: [[-.32, 0, .32], .27], right3: [[-.03, .2, .43], .2], left3: [[-.35, -.11, .13], .21],
  full4: [[-.36, -.12, .12, .36], .2], right4: [[-.03, .12, .27, .42], .13], left4: [[-.4, -.2, 0, .2], .17], gap4: [[-.4, -.23, .23, .4], .15],
};
const radiators = (upper, lower) => [-1, 1].flatMap((side, index) => { const [centers, width] = locations[index === 0 ? upper : lower]; return centers.map(x => ({ side, x, width })); });
const row = (count, side, from = -.3, to = .3) => Array.from({ length: count }, (_, i) => [from + i * (to - from) / Math.max(1, count - 1), side * .24]);
const group = (role, positions, height, profile = 'ribbed') => ({ role, positions, height, profile });
function terminals(kind = 'six', primarySide = 1, extras = [], secondaryRange = null) {
  const smooth = kind.startsWith('hv-'), low = kind === 'six-low';
  const result = [group('primary', row(3, primarySide), smooth ? 1.04 : low ? .22 : .47, smooth ? 'smooth' : 'ribbed')];
  if (kind === 'split' || kind === 'three-row') result.push(group('secondary-group-a', row(3, -primarySide, -.29, -.03), .31, 'plate'), group('secondary-group-b', row(3, -primarySide, .14, .4), .31, 'plate'));
  else if (kind === 'hv-three-row' || kind === 'hv-three-l-group') {
    result.push(group('medium', row(3, -primarySide, -.34, -.03), .38));
    result.push(group('small', kind === 'hv-three-l-group' ? [[.28, -.24], [.4, -.24], [.4, .02]] : row(3, -primarySide, .15, .4), .21, 'plate'));
  } else if (kind !== 'three-only') result.push(group('secondary', row(kind === 'three-four' ? 4 : kind === 'three-seven' ? 7 : 3, -primarySide, ...(secondaryRange || (kind === 'three-seven' ? [-.3,.3] : kind === 'three-four' ? [-.17,.17] : [-.14,.14]))), low ? .15 : .29, ['three-four', 'three-seven'].includes(kind) ? 'plate' : 'ribbed'));
  for (const [x, z, height = .34] of extras) result.push(group('additional-visible-roof-insulator', [[x, z]], height));
  return result;
}
const entry = (upper, lower, kind = 'six', options = {}) => ({ radiatorUnits: radiators(upper, lower), terminalGroups: terminals(kind, options.primarySide ?? 1, options.extraRoof || [], options.secondaryRange), ...options });
const extra = [[-.43, .24, .34]];
const endFans = (upper, lower) => [{ side: -1, end: 1, levels: upper }, { side: 1, end: -1, levels: lower }];
export const transformer2026PowerLayouts = Object.freeze({
  110: entry('right2', 'full3', 'three-only'),
  112: entry('right3', 'full4', 'three-row', { extraRoof: extra }),
  114: entry('right3', 'left3', 'split', { extraRoof: extra, fanEnds: endFans(1, 1) }),
  115: entry('right2', 'left3', 'split', { extraRoof: extra, fanEnds: [{ side: -1, end: 1, levels: 2 }, { side: 1, end: -1, levels: null, housingOnly: true }], limitation: 'The opposite-end cooling housing is drawn, but its internal fan count is not established by this end view; only its closed housing is shown.' }),
  116: entry('full4', 'full4', 'split', { fanEnds: endFans(2, 2) }),
  118: entry('right3', 'right3'),
  120: entry('right2', 'right1', 'six', { extraRoof: extra }),
  121: entry('right2', 'left2', 'six', { extraRoof: extra, fanEnds: endFans(1, 1) }),
  122: entry('right3', 'full4', 'six', { extraRoof: extra, fanEnds: endFans(2, 2) }),
  123: entry('right2', 'gap4', 'six', { extraRoof: extra, fanEnds: [{ side: -1, end: 1, levels: 2 }, { side: 1, x: -.125, end: 1, levels: 2 }, { side: 1, x: .125, end: -1, levels: null, housingOnly: true }], limitation: 'Three cooling-housing positions are drawn in plan; internal fan count of the additional far housing is not inferred.' }),
  125: entry('central2', 'central2', 'three-four', { conservatorEnd: 1 }),
  126: entry('full3', 'full3', 'three-seven', { primarySide: -1 }),
  127: entry('full3', 'full3', 'three-four', { primarySide: -1, secondaryRange: [-.28,.36] }),
  130: entry('central2', 'central2', 'six', { primarySide: -1 }),
  131: entry('full3', 'right2', 'six', { primarySide: -1 }),
  132: entry('full3', 'left2', 'six', { primarySide: -1 }),
  133: entry('full3', 'full3', 'six', { primarySide: -1 }),
  136: entry('central2', 'central2', 'six', { primarySide: -1 }),
  137: entry('full3', 'right2', 'six', { primarySide: -1 }),
  138: entry('full3', 'left2', 'six', { primarySide: -1 }),
  139: entry('full3', 'full3', 'six', { primarySide: -1 }),
  141: entry('central2', 'central2', 'six', { primarySide: -1, externalCylinder: true }),
  143: entry('full3', 'right2', 'six', { primarySide: -1, externalCylinder: true }),
  146: entry('central1', 'right2', 'hv-three', { primarySide: -1, extraRoof: [[.43, .24, .34]], conservatorAxis: 'long-side', secondaryRange: [.12,.36] }),
  147: entry('central2', 'right3', 'hv-three', { secondaryRange: [.1,.36], extraRoof: extra }),
  148: entry('full4', 'right3', 'hv-three', { secondaryRange: [.1,.36], extraRoof: extra }),
  150: entry('right4', 'left4', 'hv-three-row', { extraRoof: extra }),
  152: entry('gap2', 'gap2', 'hv-three', { secondaryRange: [.1,.36], extraRoof: extra }),
  153: entry('right2', 'left2', 'hv-three', { secondaryRange: [.1,.36], extraRoof: extra, fanEnds: endFans(1, 1) }),
  155: entry('gap2', 'full3', 'hv-three-l-group', { extraRoof: extra }),
  156: entry('right2', 'left3', 'hv-three-row', { extraRoof: extra, fanEnds: endFans(2, 1) }),
  158: entry('right2', 'right2', 'six-low', { terminalGroups: [group('primary', row(3, 1, -.06, .3), .31, 'plate'), group('secondary', row(3, -1, -.06, .3), .31, 'plate')] }),
  160: entry('full4', 'right3', 'six-low', { terminalGroups: [group('short-row', row(4, 1, -.43, .31), .22), group('plated-row', row(3, -1, -.06, .3), .46, 'plate')] }),
  163: entry('full3', 'left2', 'six-low', { primarySide: -1 }),
  164: entry('full3', 'full3', 'six-low', { primarySide: -1 }),
});
