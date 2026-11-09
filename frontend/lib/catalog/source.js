import { apiFetch } from '@/lib/api/client';
import { normalizeApiProduct, normalizeApiCatalogProduct } from './apiData';
export { normalizeApiProduct } from './apiData';
// Never silently replace an API failure with the bundled static snapshot.
export async function loadApiCatalog({ withFilters = false } = {}) {
 const all = [];
 for (let page = 1; page <= 100; page++) {
  const result = await apiFetch(`/catalog/products?page=${page}&page_size=100`);
  if (!Array.isArray(result.items) || !Number.isInteger(result.total)) throw new Error('Некорректный ответ API каталога');
  all.push(...result.items);
  if (all.length >= result.total) return all.map(withFilters ? normalizeApiCatalogProduct : normalizeApiProduct);
  if (!result.items.length) break;
 }
 throw new Error('Не удалось получить полный актуальный каталог');
}
