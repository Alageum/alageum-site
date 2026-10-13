import { apiFetch, apiPage } from "./client";
export const getCategories = () => apiPage("/catalog/categories");
export const getProducts = () => apiPage("/catalog/products");
export const getProduct = (id) => apiFetch(`/catalog/products/${id}`);
export const compareProducts = (productIds) => apiFetch("/catalog/compare", { method: "POST", body: JSON.stringify({ product_ids: productIds }) });
