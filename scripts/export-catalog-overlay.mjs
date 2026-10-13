// Small complement to the lossless PDF chunks: reviewed web records and merged overlays.
import { writeFileSync } from 'node:fs';
import { baselineOfficialProducts as officialProducts, webOfficialProducts } from '../frontend/lib/catalog/data.js';
const webIds = new Set(webOfficialProducts.map(product => product.id));
const value = {
  format: 'alageum-catalog-overlay-v1',
  recordCount: officialProducts.length,
  order: officialProducts.map(product => product.id),
  records: officialProducts.filter(product => webIds.has(product.id)),
};
writeFileSync(new URL('../docs/catalog-import/database-overlay.json', import.meta.url), `${JSON.stringify(value, null, 2)}\n`);
