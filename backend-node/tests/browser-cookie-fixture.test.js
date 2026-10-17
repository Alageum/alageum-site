"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { verifyBrowserCookieProxy } = require("../scripts/verify-browser-cookie-proxy");
const origin = "http://127.0.0.1:3141";
const organizationId = "10000000-0000-4000-8000-000000000001";
const foreignOrganizationId = "10000000-0000-4000-8000-000000000002";
const sessionId = "20000000-0000-4000-8000-000000000001";
const fixture = { origin, email: "reader@fixture.invalid", password: "Synthetic-Only-Aa1!".repeat(3), organizationId, foreignOrganizationId, env: { APP_ENV: "test" } };

test("cookie proxy proof refuses non-test, remote or real-account targets before any HTTP request", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls++; throw new Error("unexpected network call"); };
  for (const change of [{ env: { APP_ENV: "production" } }, { origin: "https://example.com" }, { origin: `${origin}/path` }, { origin: "http://user:pass@127.0.0.1:3141" }, { email: "person@example.com" }, { password: "short" }, { foreignOrganizationId: organizationId }]) {
    await assert.rejects(verifyBrowserCookieProxy({ ...fixture, ...change, fetchImpl }));
  }
  assert.equal(calls, 0);
});

test("cookie proxy proof carries HttpOnly cookies and verifies boundary, tenant, Origin and logout denial", async () => {
  const seen = [], remembered = [];
  let revoked = false;
  const fetchImpl = async (url, options) => {
    seen.push({ url, options });
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, undefined);
    const path = new URL(url).pathname;
    let body = {}, status = 200, cookie;
    if (path.endsWith("browser-prepare")) {
      assert.equal(options.headers.Origin, origin);
      body = { flow_id: sessionId }; cookie = `alageum_dev_google=${"a".repeat(43)}; Path=/; HttpOnly; SameSite=Lax`;
    } else if (path.endsWith("browser-login")) {
      assert.match(options.headers.Cookie, /alageum_dev_google=/);
      assert.equal(JSON.parse(options.body).flow_id, sessionId);
      body = { session_id: sessionId, user: { email: fixture.email } };
      cookie = `alageum_dev_session=${"b".repeat(43)}; Path=/; HttpOnly; SameSite=Lax`;
    } else {
      assert.match(options.headers.Cookie, /alageum_dev_session=/);
      if (path.endsWith("browser-logout")) {
        if (options.headers.Origin !== origin) status = 403;
        else { status = 204; revoked = true; }
      } else if (revoked || options.headers["X-Browser-Session"] !== sessionId) status = 401;
      else if (options.headers["X-Organization-ID"] !== organizationId) status = 403;
      else body = { organization: { id: organizationId } };
    }
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    if (cookie) headers.append("Set-Cookie", cookie);
    return new Response(status === 204 ? null : JSON.stringify(body), { status, headers });
  };
  const result = await verifyBrowserCookieProxy({ ...fixture, fetchImpl, rememberSecret: value => remembered.push(value) });
  assert.equal(result.status, "passed"); assert.equal(result.checks, 8);
  assert.equal(seen.length, 8); assert.deepEqual(remembered, ["a".repeat(43), "b".repeat(43)]);
  assert.equal(JSON.stringify(result).includes("a".repeat(43)), false);
  assert.match(result.browser, /not exercised/);
});

test("dedicated Node cabinet fixtures configure cookie origin before Strapi and proxy on build/start", () => {
  for (const name of ["organization", "profile", "support", "orders", "invoice", "document", "member"]) {
    const source = readFileSync(resolve(__dirname, `../scripts/run-${name}-browser.js`), "utf8");
    assert.ok(source.indexOf("process.env.ALAGEUM_BROWSER_ORIGIN = webOrigin") < source.indexOf('createStrapi({'));
    assert.match(source, /NEXT_PUBLIC_API_URL: "\/api\/v1", API_INTERNAL_BASE_URL: `\$\{origin\}\/api\/v1`/);
    assert.match(source, /E2E_[A-Z]+_API_URL: `\$\{webOrigin\}\/api\/v1`/);
    assert.match(source, /verifyBrowserCookieProxy/);
    assert.match(source, /cookieProofFinishedAt/);
    assert.match(source, /\{43,\}/, "43-character cookie credentials must be redacted");
  }
});
