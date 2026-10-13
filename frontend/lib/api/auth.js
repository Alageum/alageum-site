import { ApiError, apiFetch, clearSession, getSession, readOrganizationContext, setSession } from "./client.js";
import { browserSession } from "./federated.js";
import { getSessionGeneration } from "./sessionTransport.js";
import { getOrganizationMemberships } from './organizations.js';

let loginAttempt = 0;
let organizationAttempt = 0;
const changed = () => new ApiError(401, { error: { code: 'session_changed', message: 'Сессия изменилась. Повторите выбор организации.' } });

async function chooseOrganization(organizationId, { signal, expectedGeneration = getSessionGeneration() } = {}, assertOwner = () => {}) {
  const attempt = ++organizationAttempt;
  const loginOwner = loginAttempt;
  const current = () => !signal?.aborted && attempt === organizationAttempt &&
    loginOwner === loginAttempt &&
    getSessionGeneration() === expectedGeneration && Boolean(getSession().access_token);
  if (!current()) throw changed();
  if (typeof organizationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(organizationId)) {
    throw new ApiError(400, { error: { code: 'invalid_organization', message: 'Выберите организацию из актуального списка.' } });
  }
  const profile = await readOrganizationContext(organizationId, signal);
  if (!current()) throw changed();
  assertOwner();
  if (profile?.organization?.id !== organizationId || !profile?.user?.id || !Array.isArray(profile.permissions)) {
    throw new ApiError(502, { error: { code: 'invalid_organization_context', message: 'Не удалось подтвердить выбранную организацию.' } });
  }
  setSession({ ...getSession(), organization_id: organizationId });
  return profile;
}
export const selectOrganization = (organizationId, options) => chooseOrganization(organizationId, options);

export async function login(email, password, { signal } = {}) {
  const attempt = ++loginAttempt;
  let generation = getSessionGeneration();
  const assertCurrent = () => {
    if (signal?.aborted || attempt !== loginAttempt || getSessionGeneration() !== generation) {
      throw new ApiError(401, { error: { code: 'session_changed', message: 'Сессия изменилась. Повторите вход.' } });
    }
  };
  const pair = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }), signal });
  assertCurrent();
  setSession(pair);
  generation = getSessionGeneration();
  return finishLogin(signal, assertCurrent, generation);
}

async function finishLogin(signal, assertCurrent, generation) {
  let profile;
  try { profile = await apiFetch("/auth/me", { signal }); }
  catch (error) {
    assertCurrent();
    if (!['organization_required', 'organization_access_denied'].includes(error.code)) throw error;
    const memberships = await getOrganizationMemberships(signal);
    assertCurrent();
    // The server's /me result remains authoritative: no arbitrary first member.
    if (memberships.length !== 1) return { requiresOrganization: true, memberships, sessionGeneration: generation };
    return chooseOrganization(memberships[0].organization_id, { signal, expectedGeneration: generation }, assertCurrent);
  }
  assertCurrent();
  // /me may have legitimately rotated tokens. Keep those current credentials.
  setSession({ ...getSession(), organization_id: profile.organization.id });
  return profile;
}
export async function resumeFederatedLogin({ signal, sessionId } = {}) {
  if (typeof sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sessionId)) throw changed();
  // Suspend old profile reads without destroying the previous login. A forged
  // callback URL must not sign out a valid account when bootstrap is rejected.
  const previous = { ...getSession() }; delete previous.federated_pending;
  setSession(previous, { pendingFederated: true });
  const attempt = ++loginAttempt;
  let generation = getSessionGeneration();
  const assertCurrent = () => {
    if (signal?.aborted || attempt !== loginAttempt || getSessionGeneration() !== generation) throw changed();
  };
  let value;
  try {
    value = await browserSession(sessionId, signal);
    assertCurrent();
    if (value.session_id !== sessionId || !value.user?.id) throw new Error("Не удалось подтвердить сессию Google.");
  } catch (error) {
    if (attempt === loginAttempt && getSessionGeneration() === generation) setSession(previous);
    throw error;
  }
  // A public boundary ID is not a bearer credential. The real session token
  // stays in the HttpOnly cookie and must match this tab's session header.
  setSession({ access_token: `browser:${value.session_id}`, browser_session: value.session_id });
  generation = getSessionGeneration();
  return finishLogin(signal, assertCurrent, generation);
}
export const me = (signal) => apiFetch("/auth/me", { signal });
export async function logout() {
  loginAttempt += 1;
  const generation = getSessionGeneration();
  const session = getSession();
  if (session.browser_session) {
    try { await apiFetch("/auth/browser-logout", { method: "POST", body: JSON.stringify({}) }); }
    catch (error) { if (error.status !== 401) throw error; }
  }
  else if (session.refresh_token) await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (getSessionGeneration() === generation) clearSession();
}
