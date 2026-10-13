// Limits match the isolated server boundary. Keep document bytes/signatures in
// memory only; neither storage nor diagnostic output may contain them.
export const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
export const MAX_SIGNATURE_BYTES = 256 * 1024;
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isSha256 = value => typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value);
export const isRecord = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));
export const exactKeys = (value, fields) => isRecord(value) && Object.keys(value).length === fields.length && fields.every(key => Object.hasOwn(value, key));
export const isIsoDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));

export function decodeBase64(value, maxBytes) {
  if (typeof value !== 'string' || !value.length || value.length > 4 * Math.ceil(maxBytes / 3) ||
    value.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error('invalid_base64');
  const binary = atob(value);
  if (!binary.length || binary.length > maxBytes || btoa(binary) !== value) throw new Error('invalid_base64');
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export function validBase64(value, maxBytes) {
  try { decodeBase64(value, maxBytes); return true; } catch { return false; }
}

export async function verifyIntentBytes(intent, version, { subtle = globalThis.crypto?.subtle } = {}) {
  const mismatch = () => Object.assign(new Error('document_hash_mismatch'), { code: 'document_hash_mismatch' });
  if (!subtle) throw Object.assign(new Error('signing_crypto_unavailable'), { code: 'signing_crypto_unavailable' });
  if (intent.version_id !== version.id || intent.sha256.toLowerCase() !== version.sha256.toLowerCase()) throw mismatch();
  const bytes = decodeBase64(intent.content_base64, MAX_DOCUMENT_BYTES);
  if (bytes.length !== version.size_bytes) throw mismatch();
  const digest = await subtle.digest('SHA-256', bytes);
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  if (hash !== version.sha256.toLowerCase()) throw mismatch();
}
