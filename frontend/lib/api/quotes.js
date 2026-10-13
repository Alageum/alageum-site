import { apiFetch, createQuoteRequest } from './client.js';
export const getQuotes = (page = 1) => apiFetch(`/quotes?mine=true&page=${page}&page_size=20`);
export const getQuote = (id, signal) => apiFetch(`/quotes/${encodeURIComponent(id)}`, { signal });
export const createQuote = (data, idempotencyKey, onAcceptedReceipt) => createQuoteRequest(data, idempotencyKey, onAcceptedReceipt);
