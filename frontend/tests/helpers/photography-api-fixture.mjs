import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { productPhotographyManifest } from '../../lib/catalog/photography.js';

// Replay the supported Node/Strapi importer contract from its real source rows.
// Do not use the legacy Python importer or enrich DTOs with entire source records.
const require = createRequire(import.meta.url);
const { readCatalog } = require('../../../backend-node/src/domain/catalog-source.js');
const source = readFileSync(new URL('../../../backend-node/src/domain/catalog.js', import.meta.url), 'utf8');
const fields = name => {
  const found = source.match(new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`));
  if (!found) throw new Error(`Missing Node catalog contract ${name}`);
  return JSON.parse(found[1].replace(/,\s*\]/, ']'));
};
const specFields = fields('SPEC_FIELDS'), provenanceFields = fields('PROVENANCE_FIELDS');
const pick = (record, names) => Object.fromEntries(names.filter(key => Object.hasOwn(record,key)).map(key => [key,structuredClone(record[key])]));
export const nodeCatalogRecords = readCatalog();
export function photoPublicDto(id) {
  const record = nodeCatalogRecords.find(row=>row.id===id);
  const binding = productPhotographyManifest.records[id];
  if (!record || !binding) throw new Error(`No reviewed photo fixture for ${id}`);
  return {
    id:binding.databaseId, public_key:record.id, slug:record.id,
    category_public_key:record.category, sku:record.sku,
    translations:{ru:{name:record.name,description:record.description || ''}},
    specs:pick(record,specFields), provenance:pick(record,provenanceFields),
    media:record.image?[{kind:'image',path:record.image,alt:record.imageCaption || ''}]:[],
    status:'published', version:1, comparable:true, price:null,price_mode:'on_request',currency:null,
  };
}
