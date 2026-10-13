import { apiFetch } from '@/lib/api/client';
import { normalizeApiProduct } from './apiData';
export { normalizeApiProduct } from './apiData';
// Never silently replace an API failure with the bundled static snapshot.
export async function loadApiCatalog() {
 const all = [];
 for (let page = 1; page <= 100; page++) {
  const result = await apiFetch(`/catalog/products?page=${page}&page_size=100`);
  if (!Array.isArray(result.items) || !Number.isInteger(result.total)) throw new Error('Некорректный ответ API каталога');
  all.push(...result.items);
  if (all.length >= result.total) return all.map(normalizeApiProduct);
  if (!result.items.length) break;
 }
 throw new Error('Не удалось получить полный актуальный каталог');
}
