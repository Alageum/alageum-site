"use strict";
// Real Strapi HTTP/router/cookie wiring with local RSA Google fixtures only.
const assert = require("node:assert/strict");
const { randomBytes, generateKeyPairSync, createHash } = require("node:crypto");
const { resolve } = require("node:path");
const jwt = require("jsonwebtoken");
const { createFederatedAuth } = require("../src/domain/federated-auth");
const { createGoogleOidc, JWKS_URL } = require("../src/domain/google-oidc");
const { audit } = require("../src/domain/audit");
const url = new URL(process.env.ALAGEUM_AUTH_HTTP_TEST_DATABASE_URL || "http://invalid/");
if (process.env.APP_ENV !== "test" || url.hostname !== "127.0.0.1" || url.pathname !== "/alageum_strapi_auth_http_test" || url.search) throw Error("Use an isolated local auth HTTP test database");
process.env.DATABASE_URL = url.href;
for (const name of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) process.env[name] = randomBytes(40).toString("hex");
Object.assign(process.env, { ALAGEUM_SEED_DEMO: "0", ALAGEUM_IMPORT_CATALOG: "0", ALAGEUM_GOOGLE_ENABLED: "true", ALAGEUM_BROWSER_ORIGIN: "http://localhost:3000",
  ALAGEUM_GOOGLE_CLIENT_ID: "http-fixture.apps.googleusercontent.com", ALAGEUM_GOOGLE_CLIENT_SECRET: "local-fixture-only-secret", HOST: "127.0.0.1", PORT: "0", STRAPI_TELEMETRY_DISABLED: "true", STRAPI_HIDE_UPDATE_MESSAGE: "true" });
const root = resolve(__dirname, ".."); let app;
(async () => {
  process.chdir(root);
  app = require("@strapi/strapi").createStrapi({ appDir: root, distDir: root }); await app.load();
  const config = app.config.get("alageum"), codes = new Map();
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid: "http-fixture", alg: "RS256", use: "sig" };
  const google = createGoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret,
    redirectUri: `${config.browserOrigin}/api/v1/auth/google/callback`, fetchImpl: async (target, options) => {
      if (target === JWKS_URL) return new Response(JSON.stringify({ keys: [jwk] }));
      const form = new URLSearchParams(options.body), data = codes.get(form.get("code")); assert.ok(data);
      assert.equal(createHash("sha256").update(form.get("code_verifier")).digest("base64url"), data.challenge);
      const now = Math.floor(Date.now() / 1000);
      const token = jwt.sign({ iss: "https://accounts.google.com", aud: config.googleClientId, sub: "http-subject", email: "http-fixture@example.test", email_verified: true,
        nonce: data.nonce, iat: now, exp: now + 300 }, privateKey, { algorithm: "RS256", keyid: "http-fixture" });
      return new Response(JSON.stringify({ id_token: token, access_token: "fixture-discarded" }));
    } });
  app.alageum.federated = createFederatedAuth({ db: app.db.connection, config, audit, google });
  const logs = [], originalLog = app.log.http; app.log.http = line => { logs.push(String(line)); originalLog.call(app.log, line); };
  app.server.mount(); await new Promise((done, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", done); });
  const base = `http://127.0.0.1:${app.server.httpServer.address().port}/api/v1`;
  const headers = { Origin: config.browserOrigin, "Content-Type": "application/json" };
  let result = await fetch(base + "/auth/providers"); assert.equal(result.status, 200); assert.equal(result.headers.get("set-cookie"), null);
  assert.deepEqual(await result.json(), { google: { available: true }, egov: { available: false, reason: "integration_access_required" } });
  result = await fetch(base + "/auth/google/prepare", { method: "POST", headers: { ...headers, Origin: "https://attacker.test" }, body: "{}" }); assert.equal(result.status, 403);
  result = await fetch(base + "/auth/google/prepare", { method: "POST", headers, body: "{}" }); assert.equal(result.status, 200);
  const flow = (await result.json()).flow_id, bindingCookie = result.headers.getSetCookie()[0];
  assert.match(bindingCookie, /httponly/i); assert.match(bindingCookie, /samesite=lax/i); assert.match(bindingCookie, /path=\//i);
  const cookie = bindingCookie.split(";", 1)[0];
  result = await fetch(base + "/auth/google/start", { method: "POST", headers: { ...headers, Cookie: cookie }, body: JSON.stringify({ flow_id: flow, next: "https://attacker.test" }) }); assert.equal(result.status, 200);
  const authorize = new URL((await result.json()).authorization_url); assert.equal(authorize.origin, "https://accounts.google.com"); assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  codes.set("PRIVATE-CODE", { nonce: authorize.searchParams.get("nonce"), challenge: authorize.searchParams.get("code_challenge") });
  result = await fetch(`${base}/auth/google/callback?${new URLSearchParams({ code: "PRIVATE-CODE", state: authorize.searchParams.get("state") })}`, { headers: { Cookie: cookie }, redirect: "manual" });
  assert.equal(result.status, 302); const location = new URL(result.headers.get("location")); assert.equal(location.searchParams.get("federated"), "success"); assert.equal(location.searchParams.get("next"), "/b2b");
  const boundary = location.searchParams.get("session"), sessionCookie = result.headers.getSetCookie().find(value => value.startsWith("alageum_dev_session="));
  assert.match(sessionCookie, /httponly/i); assert.match(result.headers.get("cache-control"), /no-store/); assert.equal(result.headers.get("referrer-policy"), "no-referrer");
  const cookies = cookie + "; " + sessionCookie.split(";", 1)[0];
  result = await fetch(`${base}/auth/browser-session?session_id=${boundary}`, { headers: { Cookie: cookies } }); assert.equal(result.status, 200); assert.equal((await result.json()).session_id, boundary);
  result = await fetch(base + "/auth/me", { headers: { Cookie: cookies, "X-Browser-Session": boundary } }); assert.equal(result.status, 403); assert.equal((await result.json()).error.code, "organization_access_denied");
  result = await fetch(base + "/organizations", { headers: { Cookie: cookies, "X-Browser-Session": boundary } }); assert.equal(result.status, 200); assert.deepEqual((await result.json()).items, []);
  result = await fetch(base + "/organizations", { headers: { Cookie: cookies } }); assert.equal(result.status, 401);
  result = await fetch(base + "/auth/browser-logout", { method: "POST", headers: { ...headers, Cookie: cookies, "X-Browser-Session": boundary }, body: "{}" }); assert.equal(result.status, 204);
  result = await fetch(`${base}/auth/browser-session?session_id=${boundary}`, { headers: { Cookie: cookies } }); assert.equal(result.status, 401);
  assert.ok(logs.every(value => !value.includes("PRIVATE-CODE") && !value.includes(authorize.searchParams.get("state"))));
  console.log("Federated auth HTTP smoke: 12/12 passed; local RSA provider fixture, no live provider contact");
})().catch(error => { console.error("Federated auth HTTP smoke failed:", error.message); process.exitCode = 1; }).finally(async () => { if (app) await app.destroy(); });
