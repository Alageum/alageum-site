export const SEARCH_HISTORY_KEY = 'alageum.catalog.search-history.v1';
export function normalizeSearchHistory(value) {
  return Array.isArray(value) ? [...new Set(value.filter(item => typeof item === 'string').map(item => item.trim().slice(0, 200)).filter(Boolean))].slice(0, 8) : [];
}
export function readSearchHistory(storage) { try { return normalizeSearchHistory(JSON.parse(storage.getItem(SEARCH_HISTORY_KEY) || '[]')); } catch { return []; } }
export function rememberSearch(storage, value) {
  const query = typeof value === 'string' ? value.trim().slice(0, 200) : '';
  if (!query) return readSearchHistory(storage);
  const history = normalizeSearchHistory([query, ...readSearchHistory(storage)]);
  try { storage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history)); } catch { /* Search is usable without storage. */ }
  return history;
}
