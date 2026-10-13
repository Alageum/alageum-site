"use strict";

const { createPublicKey } = require("node:crypto");
const jwt = require("jsonwebtoken");
const { AppError } = require("./errors");
const AUTHORIZATION_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const invalid = () => new AppError("provider_identity_invalid", "Google identity could not be verified", 401);

// Fixed official endpoints: configuration cannot turn code/client-secret exchange
// into an arbitrary outbound request. The transport is injected only in tests.
function createGoogleOidc({ clientId, clientSecret, redirectUri, fetchImpl = fetch, now = Date.now }) {
  let keys = null, validUntil = 0, keyFlight = null;
  async function json(url, options = {}) {
    const response = await fetchImpl(url, { ...options, redirect: "error", signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw invalid();
    const text = await response.text();
    if (text.length > 65536) throw invalid();
    try { return { body: JSON.parse(text), headers: response.headers }; } catch { throw invalid(); }
  }
  async function key(kid) {
    if (!keys || now() >= validUntil) {
      if (!keyFlight) keyFlight = json(JWKS_URL).then(({ body, headers }) => {
        if (!Array.isArray(body.keys) || body.keys.length > 20) throw invalid();
        const next = new Map();
        for (const jwk of body.keys) {
          if (jwk.kty !== "RSA" || jwk.use !== "sig" || jwk.alg !== "RS256" || typeof jwk.kid !== "string") continue;
          try { next.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" })); } catch { throw invalid(); }
        }
        if (!next.size) throw invalid();
        keys = next;
        const age = Number(/(?:^|,)\s*max-age=(\d+)/i.exec(headers.get("cache-control") || "")?.[1] || 60);
        validUntil = now() + Math.max(0, Math.min(age, 3600)) * 1000;
      }).finally(() => { keyFlight = null; });
      await keyFlight;
    }
    // Unknown keys fail closed until the short cache expires (no attacker-driven
    // unbounded refresh traffic). Retrying login later refreshes expired keys.
    if (!keys.has(kid)) throw invalid();
    return keys.get(kid);
  }
  async function verify(idToken, nonce) {
    if (typeof idToken !== "string" || idToken.length > 16384) throw invalid();
    const decoded = jwt.decode(idToken, { complete: true });
    if (!decoded || decoded.header.alg !== "RS256" || typeof decoded.header.kid !== "string" || decoded.header.kid.length > 200) throw invalid();
    let claims;
    try {
      claims = jwt.verify(idToken, await key(decoded.header.kid), {
        algorithms: ["RS256"], issuer: ["https://accounts.google.com", "accounts.google.com"],
        audience: clientId, clockTimestamp: Math.floor(now() / 1000), clockTolerance: 0,
      });
    } catch { throw invalid(); }
    const seconds = Math.floor(now() / 1000);
    if (!claims || typeof claims !== "object" ||
      typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 255 ||
      claims.nonce !== nonce || typeof nonce !== "string" || !nonce ||
      !Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) ||
      claims.iat > seconds || claims.iat < seconds - 3600 || claims.exp <= seconds || claims.exp <= claims.iat ||
      (claims.azp !== undefined && claims.azp !== clientId) ||
      (Array.isArray(claims.aud) && claims.aud.length > 1 && claims.azp !== clientId) ||
      claims.email_verified !== true || typeof claims.email !== "string" || claims.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email)) throw invalid();
    return { provider: "google", subject: claims.sub, email: claims.email.toLowerCase(),
      displayName: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim().slice(0, 200) : claims.email.slice(0, 200) };
  }
  function authorization({ state, nonce, challenge }) {
    const url = new URL(AUTHORIZATION_URL);
    url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri,
      response_type: "code", scope: "openid email profile", state, nonce,
      code_challenge: challenge, code_challenge_method: "S256", access_type: "online", prompt: "select_account" }).toString();
    return url.href;
  }
  async function exchange({ code, verifier, nonce }) {
    const { body } = await json(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier,
        client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri }).toString() });
    return verify(body.id_token, nonce);
  }
  return { authorization, exchange, verify };
}
module.exports = { createGoogleOidc, AUTHORIZATION_URL, TOKEN_URL, JWKS_URL };
