"use strict";
// Disposable-fixture HTTP proof. This supplements, never substitutes for, the
// browser suite. Credentials are retained only in this function's cookie jar.
const assert = require("node:assert/strict");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyBrowserCookieProxy({ origin, email, password, organizationId, foreignOrganizationId, rememberSecret = () => {}, fetchImpl = fetch, env = process.env }) {
  assert.equal(env.APP_ENV, "test", "Cookie proxy proof requires disposable test mode");
  const url = new URL(origin);
  assert.ok(url.origin === origin && url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname), "Cookie proxy proof requires an exact loopback HTTP origin");
  assert.match(email, /^[^\s@]+@fixture\.invalid$/, "Only synthetic fixture accounts are allowed");
  assert.ok(typeof password === "string" && password.length >= 40);
  assert.match(organizationId, UUID); assert.match(foreignOrganizationId, UUID);
  assert.notEqual(organizationId, foreignOrganizationId);
  const jar = new Map();
  async function request(path, { method = "GET", body, session, organization, requestOrigin = origin } = {}, expected = 200) {
    const response = await fetchImpl(`${origin}/api/v1${path}`, { method, signal: AbortSignal.timeout(15000), redirect: "error", headers: {
      ...(jar.size ? { Cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; ") } : {}),
      ...(method !== "GET" ? { Origin: requestOrigin, "Content-Type": "application/json" } : {}),
      ...(session ? { "X-Browser-Session": session } : {}),
      ...(organization ? { "X-Organization-ID": organization } : {}),
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    assert.equal(response.status, expected, `Cookie proxy ${method} ${path} status`);
    assert.match(response.headers.get("cache-control") || "", /no-store/, `Cookie proxy ${path} must not be cached`);
    if (expected === 200) assert.match(response.headers.get("cache-control") || "", /private/, `Cookie proxy ${path} must be private`);
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0]; const index = pair.indexOf("=");
      const name = pair.slice(0, index), value = pair.slice(index + 1);
      if (!["alageum_dev_google", "alageum_dev_session"].includes(name)) continue;
      assert.match(cookie, /;\s*HttpOnly(?:;|$)/i);
      assert.match(cookie, /;\s*SameSite=Lax(?:;|$)/i);
      assert.match(cookie, /;\s*Path=\/(?:;|$)/i);
      assert.match(value, /^[A-Za-z0-9_-]{43}$/);
      rememberSecret(value); jar.set(name, value);
    }
    return response.status === 204 ? null : response.json();
  }
  const prepared = await request("/auth/browser-prepare", { method: "POST", body: {} });
  assert.match(prepared.flow_id, UUID); assert.ok(jar.has("alageum_dev_google"));
  const loggedIn = await request("/auth/browser-login", { method: "POST", body: { email, password, flow_id: prepared.flow_id } });
  assert.match(loggedIn.session_id, UUID); assert.ok(jar.has("alageum_dev_session"));
  assert.equal(loggedIn.user.email, email);
  assert.equal(loggedIn.access_token, undefined); assert.equal(loggedIn.refresh_token, undefined);
  const auth = { session: loggedIn.session_id, organization: organizationId };
  const profile = await request("/auth/me", auth);
  assert.equal(profile.organization.id, organizationId);
  await request("/auth/me", { organization: organizationId }, 401);
  await request("/auth/me", { ...auth, organization: foreignOrganizationId }, 403);
  await request("/auth/browser-logout", { ...auth, method: "POST", body: {}, requestOrigin: "https://untrusted.invalid" }, 403);
  await request("/auth/browser-logout", { ...auth, method: "POST", body: {} }, 204);
  await request("/auth/me", auth, 401);
  jar.clear();
  return { status: "passed", checks: 8, transport: "same-origin Next proxy with HttpOnly cookie and public tab boundary", browser: "not exercised by this HTTP proof" };
}
module.exports = { verifyBrowserCookieProxy };
