import { ApiError, apiFetch, clearSession, getSession, readOrganizationContext, setSession } from "./client.js";
import { browserSession, passwordBrowserLogin } from "./federated.js";
import { getSessionGeneration } from "./sessionTransport.js";
import { getOrganizationMemberships } from './organizations.js';

let loginAttempt = 0;
let activePasswordLogin = null;
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
  activePasswordLogin?.abort();
  const controller = new AbortController();
  activePasswordLogin = controller;
  signal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
  const previous = { ...getSession() }; delete previous.federated_pending;
  setSession(previous, { pendingFederated: true });
  const attempt = ++loginAttempt;
  let generation = getSessionGeneration();
  const assertCurrent = () => {
    if (signal?.aborted || attempt !== loginAttempt || getSessionGeneration() !== generation) {
      throw new ApiError(401, { error: { code: 'session_changed', message: 'Сессия изменилась. Повторите вход.' } });
    }
  };
  let installed = false;
  try {
    const value = await passwordBrowserLogin(email, password, signal);
    assertCurrent();
    if (typeof value.session_id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.session_id) || !value.user?.id) {
      throw new ApiError(502, { error: { code: 'invalid_browser_session', message: 'Не удалось подтвердить сессию.' } });
    }
    setSession({ access_token: `browser:${value.session_id}`, browser_session: value.session_id });
    generation = getSessionGeneration();
    installed = true;
    return await finishLogin(signal, assertCurrent, generation);
  } catch (error) {
    if (!installed && attempt === loginAttempt && getSessionGeneration() === generation) setSession(previous);
    if (signal?.aborted || attempt !== loginAttempt) throw changed();
    throw error;
  } finally {
    if (activePasswordLogin === controller) activePasswordLogin = null;
  }
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
    if (memberships.length === 0) return { requiresOnboarding: true, memberships, sessionGeneration: generation };
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
  activePasswordLogin?.abort();
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
  activePasswordLogin?.abort();
  loginAttempt += 1;
  const generation = getSessionGeneration();
  const session = getSession();
  if (session.browser_session) {
    try { await apiFetch("/auth/browser-logout", { method: "POST", body: JSON.stringify({}) }); }
    catch (error) { if (error.status !== 401) throw error; }
  }
  else if (session.refresh_token) await apiFetch("/auth/logout", { method: "POST", body: JSON.stringify({ refresh_token: session.refresh_token }) });
  if (getSessionGeneration() === generation) {
    clearSession();
    // A surviving UI owner may navigate only while this exact logout boundary
    // remains current. An older completion must never redirect a newer login.
    return { cleared: true, generation: getSessionGeneration() };
  }
  return { cleared: false };
}
