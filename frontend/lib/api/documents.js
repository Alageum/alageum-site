import { collectPages, pagePath } from "./pagination.js";
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
  try {
    return await collectPages(number => apiFetch(pagePath('/documents', number), { signal }), (page, number) =>
      record(page) && Object.keys(page).every(key => ['items', 'page', 'page_size', 'total'].includes(key)) &&
      Array.isArray(page.items) && page.items.every(validDocument) &&
      Number.isSafeInteger(page.page) && page.page === number &&
      Number.isSafeInteger(page.page_size) && page.page_size >= 1 && page.page_size <= 100 &&
      Number.isSafeInteger(page.total) && page.total >= 0 && page.items.length <= page.page_size);
  } catch (error) {
    if (error?.status || error?.name === 'AbortError') throw error;
    throw invalid();
  }
}

export const MAX_PRIVATE_DOCUMENT_BYTES = 1048576;
export async function getDocumentTypes({ signal } = {}) {
  const value = await apiFetch('/document-types', { signal });
  if (!record(value) || Object.keys(value).length !== 1 || !Array.isArray(value.items) || !value.items.every(type =>
    record(type) && Object.keys(type).length === 2 && typeof type.code === 'string' && type.code.length > 0 &&
    type.code.length <= 100 && typeof type.name === 'string' && type.name.length <= 300) ||
    new Set(value.items.map(type => type.code)).size !== value.items.length) throw invalid();
  return value.items;
}
export async function uploadDocument({ title, number, typeCode, file }, { signal } = {}) {
  const metadata = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max && !/[\x00-\x1f\x7f]/.test(value);
  const extension = file?.name?.toLowerCase().split('.').pop();
  const type = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' }[extension];
  if (!metadata(title, 300) || !metadata(typeCode, 100) || (number && !metadata(number, 120)) ||
    !(file instanceof Blob) || !file.size || file.size > MAX_PRIVATE_DOCUMENT_BYTES || !type || file.type !== type) {
    throw new ApiError(422, { error: { code: 'document_invalid_upload' } });
  }
  const body = new FormData();
  body.set('title', title.trim()); body.set('type_code', typeCode.trim());
  if (number?.trim()) body.set('number', number.trim());
  body.set('file', file, file.name);
  const value = await apiFetch('/documents', { method: 'POST', body, signal }, false);
  if (!validDocument(value)) throw invalid();
  return value;
}
