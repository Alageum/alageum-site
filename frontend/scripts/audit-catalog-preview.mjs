// Read-only validation of the disposable public export; it does not publish anything.
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { officialProducts, catalogImport } from '../lib/catalog/data.js';
import { getEquipmentVisual } from '../lib/catalog/models/visualMap.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
const root = resolve(process.argv[2] || 'preview-dist');
const exists = async path => { try { return (await stat(path)).isFile(); } catch { return false; } };
async function walk(path) {
 const entries = await readdir(path, { withFileTypes:true });
 return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(join(path,entry.name)) : [join(path,entry.name)]))).flat();
}
const files = await walk(root);
const htmlFiles = files.filter(file => file.endsWith('.html'));
const errors = [];
const visualCounts = {};
const visualTypes = new Set();
const iconCounts = {};
const iconTypes = new Set();
for (const product of officialProducts) {
 const path = join(root,'catalog',product.id,'index.html');
 if (!(await exists(path))) { errors.push(`Missing product route: ${product.id}`); continue; }
 const html = await readFile(path,'utf8');
 const visual = getEquipmentVisual(product);
 const icon = getEquipmentIcon(product);
 iconCounts[icon.confidence] = (iconCounts[icon.confidence] || 0) + 1;
 iconTypes.add(icon.type);
 if (!html.includes(`data-product-icon="${product.id}"`)) errors.push(`Missing product SVG icon: ${product.id}`);
 if (!html.includes(`data-icon-type="${icon.type}"`)) errors.push(`Wrong product icon: ${product.id}`);
 if (icon.type === 'equipment') errors.push(`Generic placeholder icon: ${product.id}`);
 if (icon.confidence === 'typical' && !html.includes('product-icon-approximation')) errors.push(`Missing approximate-icon marker: ${product.id}`);
 visualCounts[visual.confidence] = (visualCounts[visual.confidence] || 0) + 1;
 if(visual.type) visualTypes.add(visual.type);
 if (!html.includes('data-product-visual=')) errors.push(`No mapped media section: ${product.id}`);
 if (visual.type && !html.includes('Иллюстративная 3D-модель типа')) errors.push(`Missing illustrative disclosure: ${product.id}`);
 if (html.includes('<canvas')) errors.push(`Eager canvas in exported HTML: ${product.id}`);
 for (const page of product.sourcePages || []) if (!new RegExp(`/catalog/source/?\\?page=${page}(?:[&"\\\\]|$)`).test(html)) errors.push(`Missing source-page link: ${product.id} / ${page}`);
}
for(let page=1;page<=104;page++) if (!(await exists(join(root,'catalog-source',`page-${String(page).padStart(3,'0')}.webp`)))) errors.push(`Missing source page image ${page}`);
const checked = new Set();
for(const file of htmlFiles) {
 const html = await readFile(file,'utf8');
 for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
  const raw = match[1].replaceAll('&amp;','&');
  if(!raw.startsWith('/') || raw.startsWith('//')) continue;
  const pathname = decodeURIComponent(raw.split(/[?#]/)[0]);
  if(checked.has(pathname)) continue;
  checked.add(pathname);
  const target = join(root,pathname);
  if(!(await exists(target)) && !(await exists(join(target,'index.html')))) errors.push(`Broken local asset/route: ${pathname}`);
 }
}
const result = { officialRecords:officialProducts.length, importedFamilies:catalogImport.familyCount, importedDesignations:catalogImport.listedModelCount, configurations:catalogImport.configurationCount, htmlPages:htmlFiles.length, sourcePages:104, localReferencesChecked:checked.size, visualCounts, visualTypesUsed:visualTypes.size, iconCounts, iconTypesUsed:iconTypes.size, iconCoverage:officialProducts.length, errors };
console.log(JSON.stringify(result,null,2));
assert.equal(errors.length,0,errors.join('\n'));
