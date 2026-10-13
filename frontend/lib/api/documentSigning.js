import { ApiError, apiFetch } from './client.js';
import { exactKeys, isUuid, isSha256, isIsoDate, validBase64, MAX_DOCUMENT_BYTES, MAX_SIGNATURE_BYTES } from '../documents/signingData.js';

const invalid = () => new ApiError(502, { error: { code: 'invalid_signing_response', message: 'Не удалось подтвердить данные подписи.' } });
const validVersion = value => exactKeys(value, ['id', 'number', 'sha256', 'size_bytes', 'media_type']) && isUuid(value.id) &&
  Number.isSafeInteger(value.number) && value.number > 0 && isSha256(value.sha256) &&
  Number.isSafeInteger(value.size_bytes) && value.size_bytes > 0 && value.size_bytes <= MAX_DOCUMENT_BYTES && value.media_type === 'application/pdf';
const validSignature = value => exactKeys(value, ['id', 'status', 'version_id', 'sha256', 'delivery_status', 'created_at']) && isUuid(value.id) &&
  ['pending_verification', 'verified', 'rejected'].includes(value.status) && isUuid(value.version_id) && isSha256(value.sha256) &&
  value.delivery_status === 'not_configured' && isIsoDate(value.created_at);
const path = id => { if (!isUuid(id)) throw invalid(); return `/documents/${id}/signing`; };
const intentPath = (id, intentId) => { if (!isUuid(intentId)) throw invalid(); return `${path(id)}/intents/${intentId}`; };

export async function getDocumentSigning(documentId, { signal } = {}) {
  const value = await apiFetch(path(documentId), { signal });
  if (!exactKeys(value, ['enabled', 'signing_allowed', 'reason', 'document_id', 'version', 'signature']) ||
    typeof value.enabled !== 'boolean' || typeof value.signing_allowed !== 'boolean' || value.document_id !== documentId ||
    ![null, 'disabled', 'verifier_unavailable', 'file_unavailable'].includes(value.reason) ||
    !(value.version === null || validVersion(value.version)) || !(value.signature === null || validSignature(value.signature)) ||
    (value.signing_allowed && (!value.enabled || value.reason !== null || !value.version)) ||
    (!value.enabled && (value.signing_allowed || value.reason !== 'disabled')) ||
    (value.signature !== null && (!value.version || value.signature.version_id !== value.version.id || value.signature.sha256.toLowerCase() !== value.version.sha256.toLowerCase()))) throw invalid();
  return value;
}

export async function createDocumentSigningIntent(documentId, versionId, { signal } = {}) {
  if (!isUuid(versionId)) throw invalid();
  const value = await apiFetch(`${path(documentId)}/intents`, { method: 'POST', signal, body: JSON.stringify({ version_id: versionId }) }, false);
  if (!exactKeys(value, ['id', 'document_id', 'version_id', 'sha256', 'expires_at', 'content_base64']) ||
    !isUuid(value.id) || value.document_id !== documentId || value.version_id !== versionId || !isSha256(value.sha256) ||
    !isIsoDate(value.expires_at) || !validBase64(value.content_base64, MAX_DOCUMENT_BYTES)) throw invalid();
  return value;
}

export async function submitDocumentSignature(documentId, intentId, signatureBase64, { signal } = {}) {
  if (!validBase64(signatureBase64, MAX_SIGNATURE_BYTES)) throw invalid();
  const value = await apiFetch(intentPath(documentId, intentId), { method: 'POST', signal, body: JSON.stringify({ signature_base64: signatureBase64 }) }, false);
  if (!validSignature(value)) throw invalid();
  return value;
}

export async function cancelDocumentSigningIntent(documentId, intentId, { signal } = {}) {
  const value = await apiFetch(`${intentPath(documentId, intentId)}/cancel`, { method: 'POST', signal, body: '{}' }, false);
  if (value !== null) throw invalid();
}

export async function reverifyDocumentSignature(documentId, signatureId, { signal } = {}) {
  if (!isUuid(signatureId)) throw invalid();
  const value = await apiFetch(`${path(documentId)}/signatures/${signatureId}/verify`, { method: 'POST', signal, body: '{}' }, false);
  if (!validSignature(value) || value.id !== signatureId) throw invalid();
  return value;
}
