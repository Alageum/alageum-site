import { ApiError, apiFetch } from "./client.js";

const record = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const documentFields = ['id', 'number', 'title', 'external_id', 'source', 'type_code', 'latest_file_id'];
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const nullableString = value => value === null || typeof value === 'string';
const validDocument = value => record(value) && Object.keys(value).length === documentFields.length &&
  Object.keys(value).every(key => documentFields.includes(key)) && uuid(value.id) &&
  nullableString(value.number) && nullableString(value.external_id) &&
  ['title', 'source', 'type_code'].every(key => typeof value[key] === 'string') &&
  (value.latest_file_id === null || uuid(value.latest_file_id));
const invalid = () => new ApiError(502, { error: { code: 'invalid_document_response', message: 'Не удалось подтвердить данные документов.' } });

export async function getDocuments({ signal } = {}) {
  const page = await apiFetch('/documents', { signal });
  if (!record(page) || !Object.keys(page).every(key => ['items', 'page', 'page_size', 'total'].includes(key)) ||
    !Array.isArray(page.items) || !page.items.every(validDocument) ||
    !Number.isSafeInteger(page.page) || page.page !== 1 ||
    !Number.isSafeInteger(page.page_size) || page.page_size < 1 || page.page_size > 100 ||
    !Number.isSafeInteger(page.total) || page.total < 0 || page.items.length > page.page_size) throw invalid();
  // Count and rows can observe different committed snapshots. This screen keeps
  // the existing first-page read; a file UUID remains metadata, never a URL.
  return page.items;
}
