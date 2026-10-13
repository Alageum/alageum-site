import { ApiError } from './client.js';
import { loginDestination } from './loginRedirect.js';

function base() {
  const value = new URL(process.env.NEXT_PUBLIC_API_URL || '/api/v1', window.location.origin);
  if (value.origin !== window.location.origin) throw new Error('Вход требует API на том же домене, что и сайт.');
  return value.href.replace(/\/$/, '');
}
async function request(path, options = {}) {
  const response = await fetch(`${base()}${path}`, { ...options, credentials: 'same-origin', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(response.status, payload);
  return payload;
}
export const authProviders = signal => request('/auth/providers', { signal });
export const prepareGoogle = () => request("/auth/google/prepare", { method: "POST", body: "{}", signal: AbortSignal.timeout(15000) });
export const cancelGoogle = flowId => request("/auth/google/cancel", { method: "POST", body: JSON.stringify({ flow_id: flowId }) });
export const browserSession = (sessionId, signal) => request(`/auth/browser-session?session_id=${encodeURIComponent(sessionId)}`, { signal });
export async function startGoogle(next, flowId, signal) {
  const payload = await request('/auth/google/start', { method: 'POST', body: JSON.stringify({ next: loginDestination(next), flow_id: flowId }), signal });
  const url = new URL(payload.authorization_url);
  if (url.origin !== 'https://accounts.google.com' || url.pathname !== '/o/oauth2/v2/auth') throw new Error('Не удалось начать безопасный вход через Google.');
  return url.href;
}
export function federatedError(code) {
  if (code === 'provider_cancelled') return 'Вход через Google отменён. Можно попробовать снова.';
  if (code === 'account_link_required') return 'Аккаунт с этим email уже существует. Войдите прежним способом. Автоматическая привязка Google отключена.';
  if (code === 'invalid_federated_state') return 'Попытка входа истекла или уже использована. Начните вход снова.';
  return 'Не удалось подтвердить вход через Google. Попробуйте снова.';
}

// Password and provider login share the same server-side latest-flow boundary.
export async function passwordBrowserLogin(email, password, signal) {
  if (signal?.aborted) throw new DOMException('Sign-in cancelled', 'AbortError');
  const prepared = await request('/auth/browser-prepare', { method: 'POST', body: '{}', signal });
  const flowId = prepared.flow_id;
  if (typeof flowId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(flowId)) {
    throw new ApiError(502, { error: { code: 'invalid_login_flow', message: 'Не удалось начать безопасный вход.' } });
  }
  let accepted = false;
  try {
    if (signal?.aborted) throw new DOMException('Sign-in cancelled', 'AbortError');
    const value = await request('/auth/browser-login', { method: 'POST', body: JSON.stringify({ email, password, flow_id: flowId }), signal });
    if (signal?.aborted) throw new DOMException('Sign-in cancelled', 'AbortError');
    accepted = true;
    return value;
  } finally {
    if (!accepted) {
      // Independent bounded cleanup, never an automatic credential replay.
      // A newer prepare has a different flow ID and cannot be cancelled here.
      try { await request('/auth/browser-cancel', { method: 'POST', body: JSON.stringify({ flow_id: flowId }), signal: AbortSignal.timeout(5000) }); }
      catch { /* Server expiry remains the fallback if cleanup cannot arrive. */ }
    }
  }
}
