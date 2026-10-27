import { collectPages, pagePath } from './pagination.js';
import { ApiError, apiFetch } from "./client.js";

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const ticketSummary = item => record(item) && uuid(item.id) && ['subject', 'category', 'status'].every(key => typeof item[key] === 'string');
const categorySummary = item => record(item) && uuid(item.id) && ['code', 'label'].every(key => typeof item[key] === 'string');
async function readPage(path, validItem, { signal } = {}) {
  try { return await collectPages(number => apiFetch(pagePath(path, number), { signal }), (page, number) =>
    record(page) && Array.isArray(page.items) && page.items.every(validItem) &&
    Number.isSafeInteger(page.page) && page.page === number && Number.isSafeInteger(page.page_size) && page.page_size >= 1 && page.page_size <= 100 &&
    Number.isSafeInteger(page.total) && page.total >= 0 && page.items.length <= page.page_size);
  } catch (error) {
    if (error.status || error.name === 'AbortError') throw error;
    throw new ApiError(502, { error: { code: 'invalid_support_page', message: 'Не удалось подтвердить полный список обращений.' } });
  }
}

export const getTickets = options => readPage('/support/tickets', ticketSummary, options);
export const getTicketCategories = options => readPage('/support/categories', categorySummary, options);
export async function createTicket(data, { signal } = {}) {
  const summary = await apiFetch('/support/tickets', { method: 'POST', body: JSON.stringify(data), signal }, false);
  if (!ticketSummary(summary) || summary.subject !== data.subject) {
    // The server may have accepted the write before its receipt was lost.
    throw new ApiError(502, { error: { code: 'invalid_ticket_receipt', message: 'Не удалось подтвердить сохранённое обращение.' } });
  }
  return summary;
}
