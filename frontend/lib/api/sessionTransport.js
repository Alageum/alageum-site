// Website sessions persist only a public per-tab boundary and organization ID.
// The credential lives in a same-origin HttpOnly cookie. Explicit legacy API
// callers may keep a token pair in document memory, never in Web Storage.
const SESSION_KEY = "alageum_session";
let generation = 0;
let fingerprint = null;
let volatileSession = null;
let volatileWindow = null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function publicSession(value) {
  if (!value || typeof value !== "object" || !UUID.test(value.browser_session || "")) return {};
  const session = { access_token: `browser:${value.browser_session}`, browser_session: value.browser_session };
  if (typeof value.organization_id === "string" && UUID.test(value.organization_id)) session.organization_id = value.organization_id;
  return session;
}
// Callback suspension belongs only to this document, never persisted storage.
let federatedPending = false;

function sessionFingerprint() {
  const session = getSession();
  return JSON.stringify([session.access_token, session.refresh_token, session.organization_id]);
}

// A login boundary is independent of user/tenant identity. Refreshing credentials
// preserves it; logging in again to the same account starts a new boundary.
export function getSessionGeneration() {
  if (typeof window === "undefined") return 0;
  const current = sessionFingerprint();
  if (fingerprint !== null && fingerprint !== current) generation += 1;
  fingerprint = current;
  return generation;
}

export function subscribeSession(listener) {
  // A restored document may have missed a session notification while inactive.
  // Let the existing snapshot fingerprint decide whether its boundary changed.
  const restored = event => { if (event.persisted) listener(event); };
  window.addEventListener("alageum:session-changed", listener);
  window.addEventListener("storage", listener);
  window.addEventListener("pageshow", restored);
  return () => {
    window.removeEventListener("alageum:session-changed", listener);
    window.removeEventListener("storage", listener);
    window.removeEventListener("pageshow", restored);
  };
}

export function getSession() {
  if (typeof window === "undefined") return {};
  try {
    if (volatileWindow !== window) { volatileSession = null; volatileWindow = window; }
    // Old DEV bearer pairs are deliberately not restored after this migration.
    const value = volatileSession || publicSession(JSON.parse(sessionStorage.getItem(SESSION_KEY) || "{}"));
    return federatedPending ? { ...value, federated_pending: true } : value;
  } catch {
    return {};
  }
}

export function setSession(value, { preserveGeneration = false, pendingFederated = false } = {}) {
  if (typeof window !== "undefined") {
    getSessionGeneration();
    const supplied = { ...value }; delete supplied.federated_pending;
    const stored = publicSession(supplied);
    volatileWindow = window;
    volatileSession = supplied.browser_session || !supplied.access_token ? null : supplied;
    federatedPending = pendingFederated;
    if (stored.browser_session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(stored));
    else sessionStorage.removeItem(SESSION_KEY);
    if (!preserveGeneration) generation += 1;
    fingerprint = sessionFingerprint();
    window.dispatchEvent(new Event("alageum:session-changed"));
  }
}

export function clearSession() {
  if (typeof window !== "undefined") {
    getSessionGeneration();
    federatedPending = false;
    volatileSession = null;
    volatileWindow = window;
    sessionStorage.removeItem(SESSION_KEY);
    generation += 1;
    fingerprint = sessionFingerprint();
    window.dispatchEvent(new Event("alageum:session-changed"));
  }
}
