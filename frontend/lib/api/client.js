import { isPublicOnly, PUBLIC_UNAVAILABLE_MESSAGE } from '../deployment/publicMode.js';
import { clearSession, getSession, getSessionGeneration, setSession } from "./sessionTransport.js";

export { clearSession, getSession, setSession } from "./sessionTransport.js";

// The browser uses the existing v1 same-origin API boundary.
// The explicit override still supports the separate-port Docker/local setup.
const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/v1";

export class ApiError extends Error {
  constructor(status, payload) {
    super(payload?.error?.message || `API request failed (${status})`);
    this.status = status;
    this.code = payload?.error?.code;
    this.details = payload?.error?.details;
  }
}

let refreshFlight = null;

function captureSession() {
  return { ...getSession(), sessionGeneration: getSessionGeneration() };
}
function sameSession(left, right = captureSession()) {
  return left.access_token === right.access_token && left.refresh_token === right.refresh_token &&
    left.organization_id === right.organization_id && left.sessionGeneration === right.sessionGeneration;
}
function sameContext(left, right = captureSession()) {
  // Token rotation is not a new login. A tenant change or a fresh login is.
  return left.sessionGeneration === right.sessionGeneration &&
    left.organization_id === right.organization_id;
}
function sessionChanged() {
  return new ApiError(401, { error: { code: "session_changed", message: "Session changed while the request was pending" } });
}

async function rotateSession(session) {
  if (!sameSession(session)) throw sessionChanged();
  if (!session.refresh_token) throw new ApiError(401, { error: { code: "session_expired" } });
  if (refreshFlight && sameSession(refreshFlight.session, session)) return refreshFlight.promise;
  const flight = { session, promise: null };
  flight.promise = fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
    cache: "no-store",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    // Never let an old refresh overwrite credentials installed by a newer login.
    if (!sameSession(session)) throw sessionChanged();
    if (!response.ok) throw new ApiError(response.status, payload);
    const rotated = { ...payload, organization_id: session.organization_id };
    setSession(rotated, { preserveGeneration: true });
    return { ...rotated, sessionGeneration: session.sessionGeneration };
  }).finally(() => { if (refreshFlight === flight) refreshFlight = null; });
  refreshFlight = flight;
  return flight.promise;
}

function expireSession(requestSession) {
  const current = captureSession();
  // A delayed unauthorized response belongs only to the credentials it used.
  // It must not sign out an account that logged in while the request was pending.
  if (requestSession && !sameSession(requestSession, current)) return;
  if (!current.access_token && !current.refresh_token && !current.browser_session) return;
  clearSession();
  if (typeof window !== "undefined") window.dispatchEvent(new Event("alageum:session-expired"));
}

async function request(path, options = {}, retry = true, candidateOrganizationId, onAcceptedQuoteReceipt, binary = false) {
  if (isPublicOnly()) throw new ApiError(503, { error: { code: 'service_unavailable', message: PUBLIC_UNAVAILABLE_MESSAGE } });
  const session = captureSession();
  const headers = new Headers(options.headers || {});
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (session.browser_session) headers.set("X-Browser-Session", session.browser_session);
  else if (session.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  const organizationId = candidateOrganizationId ?? session.organization_id;
  if (organizationId) headers.set("X-Organization-ID", organizationId);
  const response = await fetch(`${API_URL}${path}`, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  const authenticatedRead = !path.startsWith("/auth/") || ["/auth/me", "/auth/account", "/auth/company-access-requests"].includes(path);
  const readOnly = ["GET", "HEAD"].includes((options.method || "GET").toUpperCase());
  if (response.status === 401 && retry && readOnly && session.refresh_token && authenticatedRead) {
    try {
      // Another read may already have completed the same login's refresh.
      const rotated = sameContext(session) && !sameSession(session) ? captureSession() : await rotateSession(session);
      if (!sameSession(rotated)) throw sessionChanged();
      if (options.signal?.aborted) throw sessionChanged();
      return request(path, options, false, candidateOrganizationId, undefined, binary);
    } catch (error) {
      expireSession(session);
      throw error;
    }
  }
  if (response.status === 401 && authenticatedRead) expireSession(session);
  let payload;
  if (binary && response.ok) {
    const contentType = (response.headers.get("Content-Type") || "").split(";")[0].trim();
    const size = Number(response.headers.get("Content-Length"));
    if (!["application/pdf", "image/jpeg", "image/png"].includes(contentType) || size > 1048576) {
      await response.body?.cancel();
      throw new ApiError(502, { error: { code: "invalid_document_file" } });
    }
    const reader = response.body?.getReader(), chunks = [];
    let length = 0;
    if (!reader) throw new ApiError(502, { error: { code: "invalid_document_file" } });
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > 1048576 || options.signal?.aborted || !sameContext(session)) {
          await reader.cancel();
          if (options.signal?.aborted || !sameContext(session)) throw sessionChanged();
          throw new ApiError(502, { error: { code: "invalid_document_file" } });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    if (!length) throw new ApiError(502, { error: { code: "invalid_document_file" } });
    payload = { blob: new Blob(chunks, { type: contentType }), contentType };
  } else payload = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload);
  if (onAcceptedQuoteReceipt) {
    // The sole accepted-receipt exception belongs to the fixed quote POST below.
    // Persist only its validated ID into the ORIGINAL scoped attempt. Never pass
    // old private response fields through to an active-context continuation.
    if (![200, 201].includes(response.status) || typeof payload?.id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.id)) {
      throw new ApiError(502, { error: { code: 'invalid_quote_receipt', message: 'Не удалось подтвердить номер сохранённого запроса.' } });
    }
    onAcceptedQuoteReceipt(payload.id);
  }
  // An already accepted mutation cannot be undone, but its old-context success
  // must never navigate, repaint or unlock actions in the newly selected tenant.
  // Candidate /me reads compare the ORIGINAL context, not their candidate header.
  if (session.access_token && (!sameContext(session) || options.signal?.aborted)) throw sessionChanged();
  return payload;
}

export const apiFetch = (path, options = {}, retry = true) => request(path, options, retry);

// Only authenticated private-document reads return binary data. They share the
// same refresh, tenant-generation and cancellation checks as JSON responses.
export const downloadDocumentFile = (id, { signal } = {}) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "")) {
    throw new ApiError(400, { error: { code: "invalid_document_id" } });
  }
  return request(`/documents/${id}/download`, { signal }, true, undefined, undefined, true);
};

// Only this read may override the active tenant header. Validate first; the auth
// coordinator commits a selection later without temporarily changing the session.
export const readOrganizationContext = (organizationId, signal) => request('/auth/me', { signal }, true, organizationId);

// Unlike an ordinary response callback, this hook only records an accepted UUID.
// The response itself still fails the common context guard after a tenant/login
// change. No mutation refresh/replay or generic stale-response opt-out exists.
export const createQuoteRequest = (data, idempotencyKey, onAcceptedReceipt) => request('/quotes/catalog', {
  method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(data),
}, false, undefined, quoteId => {
  // A storage failure must not turn an acknowledged server save into a replay.
  // The original durable attempt/key remains available for explicit recovery.
  try { onAcceptedReceipt?.(quoteId); } catch { /* Keep the accepted response semantics. */ }
});

export async function apiPage(path, options = {}) {
  const payload = await apiFetch(path, options);
  return payload?.items || [];
}
