import { getProductPhotograph } from './photography.js';
import { getEquipmentVisual } from './models/visualMap.js';
import { getEquipmentConstructionChoices } from './models/transformerExecutionChoices.js';
import { filterProducts } from './query.js';
import { facetValues } from './grouping.js';
export const advancedFacetKeys = ['power','voltage','current','cooling','installation','subtype','function','manufacturer'];
export function readFacetSelection(value) {try {const items=JSON.parse(value||'[]');return Array.isArray(items)?[...new Set(items.filter(item=>typeof item==='string'&&item.length<=200))].slice(0,100):[];}catch{return [];}}
export function manufacturerValues(product){const listed=Array.isArray(product.manufacturers)?product.manufacturers.filter(value=>typeof value==='string'&&value.trim()):[];const values=listed.length?listed:typeof product.manufacturer==='string'&&product.manufacturer.trim()?[product.manufacturer]:[];return values.length?[...new Set(values)]:['__unknown'];}
export function hasProductPhoto(product){return !!getProductPhotograph(product);}
export function hasProduct3D(product){const type=getEquipmentVisual(product).type;return !!(type&&type!=='equipment')||getEquipmentConstructionChoices(product).some(choice=>choice.geometryType&&choice.geometryType!=='equipment');}
const identity=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/\s+/g,'').replace(/[‐‑–—]/g,'-');
function matches(product,params,omit){const base={...params};if(params.searchMode==='exact')delete base.q;if(omit==='manufacturer')delete base.manufacturer;
 if(!filterProducts([product],base,omit).length)return false;
 if(params.hasPhoto==='1'&&!hasProductPhoto(product))return false;
 if(params.has3d==='1'&&!hasProduct3D(product))return false;
 if(params.searchMode==='exact'&&params.q&&! [product.designation,product.sku,product.name].some(value=>identity(value)===identity(params.q)))return false;
 return advancedFacetKeys.every(key=>{if(key===omit)return true;const selected=readFacetSelection(params[`f_${key}`]);if(!selected.length)return true;const values=key==='manufacturer'?manufacturerValues(product):[String(product[key]??''),...facetValues(product,key)];return selected.some(value=>values.includes(value));});}
// Conditions apply to one original record, including when a source family has members.
export function filterAdvancedProducts(products,params={},omit=''){return products.flatMap(product=>{if(!product.isCatalogGroup)return matches(product,params,omit)?[product]:[];const members=product.members||[product];const matched=members.filter(member=>matches(member,params,omit));return matched.length?[{...product,matchingMemberIds:matched.map(member=>member.id)}]:[];});}
export function advancedFacetOptions(products,params,key){const counts=new Map();for(const product of filterAdvancedProducts(products,params,key)){const members=product.isCatalogGroup?(product.members||[]).filter(member=>product.matchingMemberIds.includes(member.id)):[product];const values=new Set(members.flatMap(member=>key==='manufacturer'?manufacturerValues(member):facetValues(member,key)));for(const value of values)counts.set(value,(counts.get(value)||0)+1);}return [...counts].sort(([a],[b])=>a.localeCompare(b,'ru',{numeric:true}));}
