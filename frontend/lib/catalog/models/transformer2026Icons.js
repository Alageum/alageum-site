import { transformer2026Types } from './transformer2026Types.js';

// 64-unit vector primitives are shared by visible construction, not category/SKU.
// No Three.js dependency and no source image masquerading as a listing icon.
const line = (x1, y1, x2, y2) => `M${x1} ${y1}L${x2} ${y2}`;
const rect = (x, y, w, h) => `M${x} ${y}h${w}v${h}h-${w}z`;
const bushing = (x, y, h = 10) => `M${x} ${y}v-${h}m-3 3h6m-7 3h8m-7 3h6`;
const smallTerminal = (x, y, h = 5, plate = false) => plate ? `M${x} ${y}v-${h}M${x-1.5} ${y-h-3}h3v3h-3z` : `M${x} ${y}v-${h}m-1.6 2h3.2`;
const circle = (x, y, r) => `M${x-r} ${y}a${r} ${r} 0 1 0 ${2*r} 0a${r} ${r} 0 1 0 -${2*r} 0`;
const feet = () => [line(17, 53, 17, 57), line(47, 53, 47, 57), line(13, 58, 51, 58)];
const corrugations = (x = 14, y = 31, w = 36, h = 20) => Array.from({ length: 9 }, (_, i) => line(x + i * w / 8, y, x + i * w / 8, y + h));
const vents = (x, y, w, rows = 4) => Array.from({ length: rows }, (_, i) => line(x, y + i * 3, x + w, y + i * 3));
const grid = (x, y, w, h) => [...vents(x, y, w, 4), ...Array.from({ length: 9 }, (_, i) => line(x + i * w / 8, y, x + i * w / 8, y + h))];
const conservator = (x = 12, y = 16) => [rect(x, y, 12, 7), circle(x, y + 3.5, 3.5), line(x + 5, y + 7, x + 5, 29)];
function oilIcon(o) {
  const p = [rect(12, 29, 40, 24), rect(10, 26, 44, 3), ...feet()];
  if ((o.cooling === 'corrugated' && !o.poleBracket && !o.sideBox) || o.cooling === 'thin-ribs') p.push(...corrugations());
  if (o.poleBracket || o.sideBox) p.push(...corrugations(52, 33, 4, 17));
  if (o.cooling === 'panels') { p.push(rect(6, 33, 8, 18), rect(50, 33, 8, 18), ...corrugations(7, 34, 6, 16), ...corrugations(51, 34, 6, 16)); }
  if (o.sideOnly) { p.push(line(51, 35, 61, 35), line(51, 44, 61, 44), line(56, 31, 56, 39), line(59, 32, 59, 38), line(56, 40, 56, 48), line(59, 41, 59, 47), circle(23, 34, 1.7), circle(38, 34, 1.7)); }
  else if (o.sideTerminals) { for(const y of [26,30,34])p.push(line(52,y,60,y),line(57,y-1.5,57,y+1.5)); for(const y of [26,32])p.push(line(5,y,12,y),rect(3,y-1.5,3,3)); }
  else if (o.hood) p.push('M16 26V13h32v13M14 13h36');
  else if (o.sideBox) p.push(rect(21, 32, 34, 13), rect(20, 30, 37, 3));
  else if (o.flanged) { p.push(rect(10, 24, 16, 2), rect(39, 24, 17, 2)); for (const x of [13, 18, 23]) p.push(smallTerminal(x, 24, 7)); for (const [x,y] of [[41,24],[48,24],[44,20],[51,20]]) p.push(smallTerminal(x,y,8,true)); }
  else if (o.largeLvPlates) {
    for (const x of [24, 35, 46]) p.push(bushing(x, 26, 7));
    for (const x of [22, 31, 40, 49]) p.push(bushing(x, 26, 12), rect(x - 2.5, 9, 5, 5), line(x - 1, 11, x + 1, 11));
  }
  else if (o.singleRow) { for (let i = 0; i < 6; i++) p.push(bushing(15 + i * 7, 26, i < 3 ? 12 : 8)); }
  else {
    const positions = o.hv === 1 ? [35] : [24, 35, 46];
    for (const [i,x] of positions.entries()) p.push(o.tilted ? `M${x} 26l${(i-1)*5-2}-14m-2 4 6-2m-5 6 6-2` : bushing(x, 25, o.tallBushings ? 15 : 12));
    for (let i = 0; i < o.lv; i++) p.push(smallTerminal(16 + i * 34 / Math.max(1,o.lv-1), 30, o.equalRows ? 11 : o.lvPlateHeight ? 12 : o.lvPlates ? 9 : 5, o.lvPlates));
    if (o.thirdRow) for (const x of [20, 32, 44]) p.push(smallTerminal(x, 24, 7));
  }
  if (o.conservator) p.push(...(o.conservatorAxis === 'long-front' ? [rect(18, 7, 31, 7), circle(18,10.5,3.5), line(22,14,22,26),line(44,14,44,26)] : conservator(9, 12)));
  if (o.fillTube) p.push(o.fillTubeSide === -1 ? 'M10 26V12H7' : 'M54 26V12h3');
  if (o.drive) p.push(rect(52, 36, 6, 12), line(55, 26, 55, 36));
  if (o.poleBracket) p.push('M25 36v14h15V36M22 47h21');
  return p;
}
function measurementIcon(o) {
  const p = [...feet()];
  if (o.column) { p.push(rect(20, 44, 24, 10), rect(25, 6, 14, 8), line(32,3,32,6), line(28, 14, 28, 44), line(36, 14, 36, 44)); for (let i = 0; i < 6; i++) p.push(line(24, 18 + i * 4, 40, 18 + i * 4)); return p; }
  if (o.tank === 'box') p.push(rect(15, 33, 34, 20), rect(13, 30, 38, 3));
  else p.push(o.tank === 'polygon' ? 'M16 33l7-4h19l7 4v17l-7 4H23l-7-4zM16 33h33M23 33v21m19-21v21' : 'M16 33c0-6 32-6 32 0v17c0 6-32 6-32 0zM16 33c0 6 32 6 32 0');
  const xs = o.hv === 1 ? [32] : o.hv === 2 ? [23, 41] : [21, 32, 43];
  for (const x of xs) p.push(bushing(x, o.triangular && x === 32 ? 27 : 31, 15));
  for (let i = 0; i < (o.lv || 0); i++) p.push(smallTerminal(18 + i * 28 / Math.max(1,o.lv-1), 34, 4));
  if (o.bracket) p.push('M49 38h7v-6m-7 15h7v7');
  return p;
}
function dryIcon(o) {
  const p = [rect(10, 15, 44, 5), rect(10, 49, 44, 5), ...feet()];
  for (const x of [15, 27, 39]) { p.push(o.coil === 'cast' ? `M${x} 23h10v23h-10zM${x+2} 23v23m6-23v23` : rect(x, 24, 10, 21)); if (o.terminalPlates) p.push(rect(x + 1, 32, 8, 7)); }
  if (o.busbarFront) { for (let i=0;i<o.busbarFront;i++) p.push(line(16+i*32/(o.busbarFront-1),10,16+i*32/(o.busbarFront-1),16)); for(let i=0;i<o.busbarRear;i++) p.push(line(18+i*28/(o.busbarRear-1),5,18+i*28/(o.busbarRear-1),10)); }
  else for (const x of [20, 32, 44]) p.push(line(x, 9, x, 15));
  if (o.links) p.push('M19 26l25 17M32 26 19 43M44 26 31 43');
  return p;
}
function enclosureIcon(o) {
  const top = o.topBushings ? 23 : 10;
  const p = [rect(13, top, 38, 44 - (top - 10)), line(10, top - 2, 54, top - 2), ...feet()];
  if (o.mesh) { p.push(...grid(19, top + 4, 26, 9)); if (!o.cutaway) p.push(...grid(19, 39, 26, 9)); }
  else { p.push(...vents(19, top + 4, 26, 3), ...vents(19, 42, 26, 3)); }
  if (o.cutaway) { p.push('M13 36c8-2 16 2 25 0l13-1M20 38v12m12-12v12m12-12v12M15 50h34'); }
  if (o.topBushings) { for (const x of [22, 32, 42]) p.push(bushing(x, top - 2, 13)); for (const x of [19,28,37,46]) p.push(smallTerminal(x,top+1,4)); }
  if (o.sideTerminal) p.push(rect(51, top + 5, 5, 8));
  if (o.sideVents) p.push(...vents(52,42,5,3));
  return p;
}
function powerIcon(o) {
  const p = [rect(12, 33, 40, 20), 'M12 33l5-6h40l-5 6M52 33v20l5-6V27', ...feet()];
  // Both plan-side groups remain visible in a compact oblique schematic. The
  // separate unit count and relative grouping come from the same source layout.
  for (const unit of o.radiatorUnits) {
    const width = unit.width * 34, x = 32 + unit.x * 34 - width / 2;
    p.push(rect(x + (unit.side < 0 ? 3 : 0), unit.side < 0 ? 30 : 40, width, unit.side < 0 ? 6 : 13));
  }
  for (const group of o.terminalGroups) for (const [x,z] of group.positions) {
    const cx=32+x*38+z*5, y=29+z*12, height=group.profile==='smooth'?18:Math.max(4,group.height*23);
    if(group.profile==='smooth') p.push(rect(cx-1.2,y-height,2.4,height),line(cx,y-height-2,cx,y-height));
    else if(group.profile==='plate') p.push(smallTerminal(cx,y,height,true));
    else p.push(smallTerminal(cx,y,height),line(cx-2,y-height*.5,cx+2,y-height*.5));
  }
  if(o.conservatorAxis==='long-side') p.push(rect(8,17,23,6),circle(8,20,3),line(13,23,13,32));
  else p.push(...conservator(o.conservatorEnd===1?47:7,19));
  for(const fan of o.fanEnds||[]) {
    const x=fan.x == null ? (fan.end>0?58:6) : 32+fan.x*34;
    if(fan.housingOnly)p.push(rect(x-2,39,4,10));
    else for(let i=0;i<fan.levels;i++)p.push(circle(x,40+i*8,2.6),line(x-2,40+i*8,x+2,40+i*8));
  }
  if(o.ladder){p.push('M8 32 4 56M13 32 9 56');for(let i=0;i<5;i++)p.push(line(8-i*.7,36+i*4,12-i*.7,36+i*4));}
  if(o.externalCylinder)p.push(rect(52,36,7,15),'M52 36c0-3 7-3 7 0M52 51c0 3 7 3 7 0');
  else if(o.drive)p.push(rect(53,44,6,10));
  return p;
}
const iconBuilders = { oil: oilIcon, measurement: measurementIcon, 'dry-open': dryIcon, enclosure: enclosureIcon, 'power-assembly': powerIcon };
const accessories = {
  'tr26-icon-temperature-relay': { name: 'Цифровое температурное реле', pages: [85], paths: [rect(8, 16, 48, 32), rect(16, 22, 32, 10), ...[18, 28, 38].map(x => circle(x, 40, 2)), circle(49,35,1.6), circle(49,42,1.6), 'M11 13v3m8-3v3m8-3v3m8-3v3m8-3v3m8-3v3M11 48v4m8-4v4m8-4v4m8-4v4m8-4v4m8-4v4'] },
  'tr26-icon-temperature-probe': { name: 'Температурный датчик с кабелем', pages: [85], paths: ['M12 52 23 37l3 2-11 15zM25 38c6-9-7-17 1-24 17-14 34 14 20 24-8 6-17-1-12-8 4-7 14-3 10 4'] },
  'tr26-icon-vibration-damper': { name: 'Виброопора прямоугольной формы', pages: [85], paths: ['M9 40 28 18h26v15L36 53H9zM9 40h27l18-22M36 40v13M16 36h20l11-12H28zM4 52h34l19-20v5L38 58H4z', circle(11,55,1.4), circle(47,45,1.4)] },
  'tr26-icon-thermal-cabinet': { name: 'Лицевая панель шкафа тепловой защиты', pages: [86], paths: [rect(12, 9, 40, 47), rect(19, 17, 18, 8), circle(44, 21, 3), ...[23, 33, 43].flatMap(x => [circle(x, 35, 2), circle(x, 46, 2)])] },
  'tr26-icon-cooling-fan': { name: 'Линейный вентилятор охлаждения', pages: [86], paths: [rect(7, 23, 50, 22), rect(13, 27, 37, 14), ...vents(15, 29, 33, 4), 'M7 20v28m50-28v28M10 19v4m44-4v4'] },
};
export const transformer2026IconDefinitions = Object.freeze({
  ...Object.fromEntries(Object.entries(transformer2026Types).map(([id, definition]) => [id, Object.freeze({ name: definition.name, pages: definition.pages, paths: Object.freeze(iconBuilders[definition.build](definition.layout)), confidence: 'source-topology-proposal', exactProductIcon: false })])),
  ...Object.fromEntries(Object.entries(accessories).map(([id, definition]) => [id, Object.freeze({ ...definition, confidence: 'source-photo-silhouette-proposal', exactProductIcon: false, geometryType: null })])),
});
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]);
export function renderTransformer2026Icon(type, size = 64, title) {
  if (!Object.hasOwn(transformer2026IconDefinitions, type)) return null;
  if (!Number.isFinite(size) || size <= 0 || size > 2048) throw new RangeError('Icon size must be finite and between 0 and 2048');
  const definition = transformer2026IconDefinitions[type];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"${title ? ` role="img" aria-label="${escape(title)}"` : ' aria-hidden="true"'}>${title ? `<title>${escape(title)}</title>` : ''}${definition.paths.map(path => `<path d="${path}"/>`).join('')}</svg>`;
}
