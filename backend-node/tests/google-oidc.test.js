"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { generateKeyPairSync, createHash } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { createGoogleOidc, JWKS_URL, TOKEN_URL, AUTHORIZATION_URL } = require("../src/domain/google-oidc");
const { settings, returnPath, createFederatedAuth } = require("../src/domain/federated-auth");
const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "local-key", use: "sig", alg: "RS256" };
const clientId = "local-client.apps.googleusercontent.com", nonce = "test-nonce", seconds = 1900000000;
const claims = { iss: "https://accounts.google.com", aud: clientId, sub: "stable-subject", iat: seconds, exp: seconds + 300, nonce, email: "User@example.test", email_verified: true };
const sign = changes => jwt.sign({ ...claims, ...changes }, privateKey, { algorithm: "RS256", keyid: "local-key" });
function provider({ token = sign(), fetcher, time = () => seconds * 1000 } = {}) {
  const calls = [];
  const google = createGoogleOidc({ clientId, clientSecret: "local-secret-only", redirectUri: "https://local.example/api/v1/auth/google/callback", now: time,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (fetcher) return fetcher(url, options);
      return new Response(JSON.stringify(url === JWKS_URL ? { keys: [jwk] } : { id_token: token, access_token: "never-stored", refresh_token: "never-stored" }), { headers: { "cache-control": "max-age=60" } });
    } });
  return { google, calls };
}
test("real signed Google fixture verifies pinned keys, nonce and stable subject", async () => {
  const { google, calls } = provider();
  assert.deepEqual(await google.exchange({ code: "code", verifier: "verifier", nonce }), { provider: "google", subject: "stable-subject", email: "user@example.test", displayName: "User@example.test" });
  assert.equal(calls[0].url, TOKEN_URL); assert.equal(calls[1].url, JWKS_URL);
  const form = new URLSearchParams(calls[0].options.body);
  assert.equal(form.get("code_verifier"), "verifier"); assert.equal(form.get("client_secret"), "local-secret-only");
  assert.equal(calls[0].options.redirect, "error");
  assert.equal(await google.verify(sign({ iss: "accounts.google.com" }), nonce).then(value => value.subject), "stable-subject");
});
test("authorization uses state, nonce, S256 and only login scopes, never offline access", () => {
  const { google } = provider(); const challenge = createHash("sha256").update("verifier").digest("base64url");
  const url = new URL(google.authorization({ state: "state", nonce, challenge }));
  assert.equal(url.origin + url.pathname, AUTHORIZATION_URL);
  for (const [key, value] of Object.entries({ state: "state", nonce, code_challenge: challenge, code_challenge_method: "S256", response_type: "code", scope: "openid email profile", access_type: "online" })) assert.equal(url.searchParams.get(key), value);
});
test("wrong issuer, audience, nonce, azp, time, unverified email and missing subject are rejected", async t => {
  for (const change of [{ iss: "https://evil.test" }, { aud: "another-client" }, { nonce: "wrong" }, { azp: "another-client" }, { aud: [clientId, "other"] }, { exp: seconds }, { iat: seconds + 1 }, { iat: seconds - 3601 }, { email_verified: false }, { email_verified: "true" }, { sub: "" }, { email: "invalid" }, { nbf: seconds + 1 }]) {
    await t.test(JSON.stringify(change), async () => assert.rejects(provider().google.verify(sign(change), nonce), { code: "provider_identity_invalid" }));
  }
});
test("bad signature, algorithm substitution, unknown key, oversized token and provider outage fail closed", async () => {
  const other = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const tokens = [jwt.sign(claims, other.privateKey, { algorithm: "RS256", keyid: "local-key" }), jwt.sign(claims, "attacker", { algorithm: "HS256", keyid: "local-key" }), jwt.sign(claims, privateKey, { algorithm: "RS256", keyid: "unknown" }), "a".repeat(16385), "bad"];
  for (const token of tokens) await assert.rejects(provider().google.verify(token, nonce), { code: "provider_identity_invalid" });
  await assert.rejects(provider({ fetcher: async () => new Response("{}", { status: 500 }) }).google.exchange({ code: "a", verifier: "b", nonce }), { code: "provider_identity_invalid" });
});
test("expired JWKS must refresh and cannot silently reuse stale keys on failure", async () => {
  let time = seconds * 1000, requests = 0;
  const { google } = provider({ time: () => time, fetcher: async () => {
    if (++requests > 1) return new Response("{}", { status: 503 });
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=1" } });
  } });
  await google.verify(sign(), nonce); time += 2000;
  await assert.rejects(google.verify(sign(), nonce), { code: "provider_identity_invalid" });
  assert.equal(requests, 2);
});
test("configuration defaults closed; local HTTP only, no arbitrary redirects or cookie domain", async () => {
  assert.equal(settings({}), null);
  const config = { googleEnabled: true, googleClientId: clientId, googleClientSecret: "local-secret-only", env: "development", browserOrigin: "http://localhost:3000" };
  assert.equal(settings(config).secure, false);
  assert.equal(settings({ ...config, browserOrigin: "https://b2b.example.test" }).secure, true);
  for (const origin of ["https://b2b.example.test/path", "http://public.example.test", "https://user:secret@b2b.example.test", "//evil.test"]) assert.throws(() => settings({ ...config, browserOrigin: origin }));
  assert.throws(() => settings({ ...config, googleClientSecret: "" }));
  for (const path of ["https://evil.test", "//evil.test", "/\\evil.test", "javascript:alert(1)", "/b2b?next=https://evil.test"]) assert.equal(returnPath(path), "/b2b");
  const disabled = createFederatedAuth({ db: {}, config: {}, audit: async () => {} });
  await assert.rejects(disabled.currentUser({}), { code: "authentication_required", status: 401 });
});
