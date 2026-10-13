import { ApiError, apiFetch } from "./client.js";

export const orderId = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const decimal = (value, scale) => typeof value === 'string' && new RegExp(`^\\d+\\.\\d{${scale}}$`).test(value);
const validItem = value => record(value) && orderId(value.id) && typeof value.description === 'string' &&
  decimal(value.quantity, 3) && (value.unit_price === null || decimal(value.unit_price, 2)) && record(value.configuration);
const validOrder = value => record(value) && orderId(value.id) &&
  (value.external_id === null || typeof value.external_id === 'string') &&
  ['number', 'currency', 'status'].every(key => typeof value[key] === 'string') &&
  decimal(value.amount, 2) && Array.isArray(value.items) && value.items.every(validItem);
const invalid = () => new ApiError(502, { error: { code: 'invalid_order_response', message: 'Не удалось подтвердить данные заказа.' } });

export async function getOrders({ signal } = {}) {
  const page = await apiFetch('/orders', { signal });
  if (!record(page) || !Array.isArray(page.items) || !page.items.every(validOrder) ||
    !Number.isSafeInteger(page.page) || page.page !== 1 ||
    !Number.isSafeInteger(page.page_size) || page.page_size < 1 || page.page_size > 100 ||
    !Number.isSafeInteger(page.total) || page.total < page.items.length || page.items.length > page.page_size) throw invalid();
  // This screen intentionally displays only the existing first page.
  return page.items;
}

export async function getOrder(id, { signal } = {}) {
  if (!orderId(id)) throw new ApiError(422, { error: { code: 'invalid_order_id', message: 'Некорректный номер заказа.' } });
  const item = await apiFetch(`/orders/${id}`, { signal });
  if (!validOrder(item) || item.id.toLowerCase() !== id.toLowerCase()) throw invalid();
  return item;
}
