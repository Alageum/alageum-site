import { apiFetch } from './client';
const base = '/admin/catalog';
export const listAdminCategories = () => apiFetch(`${base}/categories?page_size=100`);
export const listAdminProducts = (query) => apiFetch(`${base}/products?${new URLSearchParams(query)}`);
export const getAdminProduct = (id) => apiFetch(`${base}/products/${encodeURIComponent(id)}`);
export const createAdminProduct = (body) => apiFetch(`${base}/products`, { method: 'POST', body: JSON.stringify(body) });
export const updateAdminProduct = (id, body) => apiFetch(`${base}/products/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });
export const changeAdminVisibility = (id, action, version) => apiFetch(`${base}/products/${encodeURIComponent(id)}/${action}`, { method: 'POST', body: JSON.stringify({ version }) });
