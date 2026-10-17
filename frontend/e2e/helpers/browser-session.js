import { expect, test } from '@playwright/test';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const loginTimes = [];

// Prepare and password verification each consume a slot in the shared real
// 20/minute browser limiter. Reserve room for cancellation and diagnostics;
// waiting never disables the limiter or retries a rejected credential attempt.
export async function browserLoginSlot() {
  while (loginTimes.length && Date.now() - loginTimes[0] > 61000) loginTimes.shift();
  if (loginTimes.length >= 8) {
    const wait = Math.max(0, 61050 - (Date.now() - loginTimes[0]));
    test.setTimeout(test.info().timeout + wait);
    await new Promise(resolve => setTimeout(resolve, wait));
    while (loginTimes.length && Date.now() - loginTimes[0] > 61000) loginTimes.shift();
  }
  loginTimes.push(Date.now());
}

// page.request shares this browser context's HttpOnly cookies. The independent
// Playwright request fixture does not, so it must never install browser auth.
export async function installBrowserSession(page, { email, password, organizationId, notify = true }) {
  await browserLoginSlot();
  const origin = new URL(page.url()).origin;
  const api = `${origin}/api/v1`;
  const prepared = await page.request.post(`${api}/auth/browser-prepare`, { headers: { Origin: origin }, data: {} });
  expect(prepared.status()).toBe(200);
  const { flow_id: flowId } = await prepared.json();
  expect(flowId).toMatch(uuid);
  const accepted = await page.request.post(`${api}/auth/browser-login`, {
    headers: { Origin: origin }, data: { email, password, flow_id: flowId },
  });
  expect(accepted.status()).toBe(200);
  const payload = await accepted.json();
  expect(payload.session_id).toMatch(uuid);
  expect(payload).not.toHaveProperty('access_token');
  expect(payload).not.toHaveProperty('refresh_token');
  const session = { access_token: `browser:${payload.session_id}`, browser_session: payload.session_id };
  if (organizationId) session.organization_id = organizationId;
  await page.evaluate(({ session, notify }) => {
    sessionStorage.setItem('alageum_session', JSON.stringify(session));
    if (notify) window.dispatchEvent(new Event('alageum:session-changed'));
  }, { session, notify });
  return session;
}

export async function logoutBrowserSession(page) {
  const sessionId = await page.evaluate(() => JSON.parse(sessionStorage.getItem('alageum_session') || '{}').browser_session);
  expect(sessionId).toMatch(uuid);
  const origin = new URL(page.url()).origin;
  const response = await page.request.post(`${origin}/api/v1/auth/browser-logout`, {
    headers: { Origin: origin, 'X-Browser-Session': sessionId }, data: {},
  });
  expect(response.status()).toBe(204);
  await page.evaluate(() => {
    sessionStorage.removeItem('alageum_session');
    window.dispatchEvent(new Event('alageum:session-changed'));
  });
}
