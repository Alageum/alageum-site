// Reproducible icon coverage and rendered source/shape contact sheets (no browser claims).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import sharp from 'sharp';
import { officialProducts, importedProducts } from '../lib/catalog/data.js';
import { equipmentIconTypes } from '../lib/catalog/models/iconTypes.js';
import { getEquipmentIcon } from '../lib/catalog/models/iconMap.js';
import { renderEquipmentIcon } from '../tests/helpers/render-equipment-icon.mjs';
const output = resolve(process.argv[2] || new URL('../../docs/catalog-import/icon-review', import.meta.url).pathname);
const publicRoot = new URL('../public/', import.meta.url).pathname;
await mkdir(output, {recursive:true});
const records = officialProducts.map(product => ({id:product.id, name:product.name, ...getEquipmentIcon(product)}));
const counts = records.reduce((result,icon) => ({...result, [icon.confidence]:(result[icon.confidence] || 0)+1}), {});
const types = [...new Set(records.map(icon => icon.type))];
const result = {officialRecords:records.length, covered:records.filter(icon=>icon.type !== 'equipment').length, sharedTypes:types.length, confidence:counts, records};
await writeFile(join(output,'icon-coverage.json'),JSON.stringify(result,null,2)+'\n');
const xml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const families = importedProducts.filter(product=>product.recordKind === 'family');
for(let batch=0;batch<families.length;batch+=20){
 const subset=families.slice(batch,batch+20); const rows=Math.ceil(subset.length/4);
 const cells=[];
 for (let i=0;i<subset.length;i++){
  const product=subset[i], icon=getEquipmentIcon(product), x=(i%4)*330,y=Math.floor(i/4)*175;
  let source='';
  if(icon.sourceImage){const png=await sharp(await readFile(join(publicRoot,icon.sourceImage))).resize(130,108,{fit:'inside'}).png().toBuffer(); source=`<image x="8" y="41" width="135" height="108" href="data:image/png;base64,${png.toString('base64')}"/>`;}
  const markup=(await renderEquipmentIcon(icon.type,88)).replace(/<svg /,'<svg x="198" y="50" ').replaceAll('currentColor','#56616c');
  cells.push(`<g transform="translate(${x} ${y})"><rect width="330" height="175" fill="white" stroke="#d9dee4"/><text x="10" y="20" font-size="10" fill="#121c26">${xml(product.id)}</text><text x="10" y="35" font-size="10" fill="#6b7280">стр. ${icon.sourcePages.join(',')} · ${icon.confidence}</text>${source || '<text x="12" y="100" font-size="11" fill="#8b9096">Нет рисунка</text>'}<rect x="172" y="42" width="138" height="111" rx="3" fill="#f3f5f7"/>${markup}<text x="10" y="166" font-size="10" fill="#4b5563">${xml(icon.type)}</text></g>`);
 }
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1320" height="${rows*175}" font-family="DejaVu Sans,Arial,sans-serif"><rect width="100%" height="100%" fill="white"/>${cells.join('')}</svg>`;
 await sharp(Buffer.from(svg)).png().toFile(join(output,`source-icons-${String(batch/20+1).padStart(2,'0')}.png`));
}
const rows=Math.ceil(types.length/7), tiles=[];
for(let i=0;i<types.length;i++){
 const type=types[i],x=i%7*170,y=Math.floor(i/7)*146;
 const markup=(await renderEquipmentIcon(type,80)).replace('<svg ','<svg x="45" y="12" ').replaceAll('currentColor','#56616c');
 const words=equipmentIconTypes[type].name.match(/.{1,24}(?:\s|$)|.{1,24}/g) || [];
 tiles.push(`<g transform="translate(${x} ${y})"><rect width="170" height="146" fill="#f8f9fa" stroke="#e0e3e7"/>${markup}${words.slice(0,3).map((word,line)=>`<text x="85" y="${107+line*13}" text-anchor="middle" font-size="10">${xml(word.trim())}</text>`).join('')}</g>`);
}
await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1190" height="${rows*146}" font-family="DejaVu Sans,Arial,sans-serif"><rect width="100%" height="100%" fill="white"/>${tiles.join('')}</svg>`)).png().toFile(join(output,'shared-icon-library.png'));
console.log(JSON.stringify({...result, records:undefined, output},null,2));
