import { comparisonSpecValue } from './comparison.js';
import { catalogSpecValueText } from './ptmmDimensionQualification.js';
import { categoryName, specRows, valueOrDash, specUnit } from './data.js';

// Keep top-level parameters and API attributes when no technical table exists.
export function liveComparisonRows(products) {
  const detailed = new Map();
  for (const product of products) {
    for (const row of product.technicalSpecs || []) detailed.set(`detail:${row.label}|${row.unit || ''}`, { ...row, key: `detail:${row.label}|${row.unit || ''}`, technical: true });
    for (const row of product.attributes || []) detailed.set(`attribute:${row.code}|${row.unit || ''}`, { key: `attribute:${row.code}|${row.unit || ''}`, label: row.code, unit: row.unit || '', attribute: true, code: row.code });
  }
  return [{ key: 'category', label: 'Категория' }, ...specRows, ...detailed.values()];
}
export function liveComparisonValue(product, row) {
  if (row.technical) return comparisonSpecValue(product.technicalSpecs || [], row);
  if (row.attribute) {
    const found = (product.attributes || []).find(item => item.code === row.code && (item.unit || '') === row.unit);
    return found ? (typeof found.value === 'object' ? JSON.stringify(found.value) : String(found.value ?? '—')) : '—';
  }
  return row.key === 'category' ? categoryName(product.category) : valueOrDash(product[row.key], specUnit(product, row));
}
export const liveRowDiffers = (products, row) => new Set(products.map(product => {
  const value = liveComparisonValue(product, row);
  return row.technical ? catalogSpecValueText(product, row, value) : value;
})).size > 1;
