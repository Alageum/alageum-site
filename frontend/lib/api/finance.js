import { ApiError, apiFetch, apiPage } from "./client.js";

const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const invoiceFields = ['id', 'number', 'amount', 'currency', 'status', 'source'];
const nullableString = (value, key) => !Object.hasOwn(value, key) || value[key] === null || typeof value[key] === 'string';
const validInvoice = value => record(value) && Object.keys(value).every(key => invoiceFields.includes(key)) &&
  typeof value.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.id) &&
  nullableString(value, 'number') && nullableString(value, 'status') &&
  typeof value.amount === 'string' && /^(?:0|[1-9]\d{0,15})\.\d{2}$/.test(value.amount) &&
  typeof value.currency === 'string' && typeof value.source === 'string';
const invalid = () => new ApiError(502, { error: { code: 'invalid_invoice_response', message: 'Не удалось подтвердить данные счетов.' } });

export async function getInvoices({ signal } = {}) {
  const page = await apiFetch('/finance/invoices', { signal });
  if (!record(page) || !Object.keys(page).every(key => ['items', 'page', 'page_size', 'total'].includes(key)) ||
    !Array.isArray(page.items) || !page.items.every(validInvoice) ||
    !Number.isSafeInteger(page.page) || page.page !== 1 ||
    !Number.isSafeInteger(page.page_size) || page.page_size < 1 || page.page_size > 100 ||
    !Number.isSafeInteger(page.total) || page.total < 0 || page.items.length > page.page_size) throw invalid();
  // The frozen DTO defaults these two optional strings to null. Count and row
  // queries can see different committed snapshots, so total need not match rows.
  // This screen intentionally displays only the existing first page.
  return page.items.map(item => ({ ...item, number: item.number ?? null, status: item.status ?? null }));
}

export const getPayments = () => apiPage("/finance/payments");
