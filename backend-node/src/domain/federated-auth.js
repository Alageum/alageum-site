"use strict";
const { createHash, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const { AppError } = require("./errors");
const { createGoogleOidc } = require("./google-oidc");
const { createDistributedRateLimiter } = require("./distributed-rate-limit");
const { clientAddress } = require("./client-address");
const { createBrowserSessions, browserSettings } = require("./browser-sessions");
const table = (db, name) => db.withSchema("b2b").table(name);
const hash = value => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const invalid = () => new AppError("invalid_federated_state", "Restart Google sign-in", 401);
const denied = () => new AppError("authentication_required", "Sign in again", 401);
const safeEqual = (left, right) => typeof left === "string" && typeof right === "string" && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function returnPath(value) {
  if (["/admin/catalog", "/account", "/b2b/access-requests", "/b2b", "/b2b/orders", "/b2b/quotes", "/b2b/profile", "/b2b/support", "/b2b/finance", "/b2b/documents", "/inquiry?source=api"].includes(value)) return value;
  if (typeof value === "string" && /^\/b2b\/(?:orders|quotes)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/print)?$/i.test(value)) return value;
  return "/b2b";
}
function settings(config) {
  if (!config.googleEnabled) return null;
  const browser = browserSettings(config);
  if (!browser) throw new Error("ALAGEUM_BROWSER_ORIGIN must be a same-origin application URL");
  if (typeof config.googleClientId !== "string" || !config.googleClientId.endsWith(".apps.googleusercontent.com") ||
      typeof config.googleClientSecret !== "string" || config.googleClientSecret.length < 16) throw new Error("Google login requires explicit server-side client credentials");
  return { ...browser, redirectUri: `${browser.origin}/api/v1/auth/google/callback` };
}
function createFederatedAuth({ db, config, audit, google, now = Date.now, browserSessions }) {
  const setup = settings(config);
  const provider = setup && (google || createGoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: setup.redirectUri }));
  const limit = setup ? createDistributedRateLimiter({ db, secret: config.jwtSecret, policy: "auth-entry", limit: 20 }) : null;
  const browser = browserSessions || createBrowserSessions({ db, config, audit, now });
  const browserService = browser;
  const { sessionCookie, attemptCookie, headers, cookie, sameOrigin } = browser;
  const unavailable = () => { if (!setup) throw new AppError("provider_unavailable", "Google sign-in is not configured", 503); };
  function providers(ctx) {
    headers(ctx);
    ctx.body = { google: { available: Boolean(setup) }, egov: { available: false, reason: "integration_access_required" } };
  }
  async function prepare(ctx) { unavailable(); return browser.prepare(ctx); }
  async function start(ctx) {
    headers(ctx); unavailable(); sameOrigin(ctx); await limit(clientAddress(ctx), ctx);
    const body = ctx.request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["next", "flow_id"].includes(key)) || typeof body.flow_id !== "string" || !UUID.test(body.flow_id)) throw new AppError("validation_error", "Invalid sign-in request", 422);
    const priorBrowser = ctx.cookies.get(attemptCookie, { signed: false });
    if (typeof priorBrowser !== "string" || !TOKEN.test(priorBrowser)) throw invalid();
    const browser = priorBrowser;
    const state = random(), nonce = random(), verifier = random();
    // Cleanup is outside the flow transaction: every mutation locks the browser
    // row before attempt/session rows, preventing an expiry-cleanup lock inversion.
    await browserService.cleanupExpired();
    await db.transaction(async tx => {
      const flow = await table(tx, "federated_browsers").where({ browser_hash: hash(browser), flow_id: body.flow_id }).forUpdate().first();
      if (!flow || new Date(flow.expires_at).getTime() <= now()) throw invalid();
      await table(tx, "federated_browsers").where({ browser_hash: hash(browser) }).update({ state_hash: hash(state) });
      await table(tx, "federated_attempts").where({ browser_hash: hash(browser) }).delete();
      await table(tx, "federated_attempts").insert({ state_hash: hash(state), browser_hash: hash(browser), nonce, verifier,
        return_path: returnPath(body.next), expires_at: new Date(now() + 300000) });
    });
    cookie(ctx, attemptCookie, browser, 8 * 3600);
    ctx.body = { authorization_url: provider.authorization({ state, nonce, challenge: createHash("sha256").update(verifier).digest("base64url") }) };
  }
  async function callback(ctx) {
    headers(ctx); unavailable(); await limit(clientAddress(ctx), ctx);
    let destination = "/b2b";
    try {
      const state = ctx.query.state, browser = ctx.cookies.get(attemptCookie, { signed: false });
      if (typeof state !== "string" || !TOKEN.test(state) || typeof browser !== "string" || !TOKEN.test(browser)) throw invalid();
      // DELETE ... RETURNING consumes the attempt atomically before the provider
      // exchange. Cancellation and failures cannot be replayed, even concurrently.
      const attempt = await db.transaction(async tx => {
        const latest = await table(tx, "federated_browsers").where({ browser_hash: hash(browser), state_hash: hash(state) }).forUpdate().first();
        if (!latest || new Date(latest.expires_at).getTime() <= now()) throw invalid();
        const row = await table(tx, "federated_attempts").where({ state_hash: hash(state) }).forUpdate().first();
        if (!row || !safeEqual(row.browser_hash, hash(browser)) || new Date(row.expires_at).getTime() <= now()) throw invalid();
        await table(tx, "federated_attempts").where({ state_hash: hash(state) }).delete();
        return row;
      });
      destination = returnPath(attempt.return_path);
      if (ctx.query.error) throw new AppError("provider_cancelled", "Google sign-in was cancelled", 400);
      if (typeof ctx.query.code !== "string" || !ctx.query.code || ctx.query.code.length > 4096) throw invalid();
      const identity = await provider.exchange({ code: ctx.query.code, verifier: attempt.verifier, nonce: attempt.nonce });
      const raw = random(), sessionId = randomUUID();
      await db.transaction(async tx => {
        // Serialize account creation, including the same email on two subjects.
        // Distributed admission is charged before this transaction. Never use
        // an email match to attach an identity.
        const latest = await table(tx, "federated_browsers").where({ browser_hash: hash(browser), state_hash: hash(state) }).forUpdate().first();
        if (!latest || new Date(latest.expires_at).getTime() <= now()) throw invalid();
        await table(tx, "federated_browsers").where({ browser_hash: hash(browser) }).update({ state_hash: null });
        await tx.raw("SELECT pg_advisory_xact_lock(731624120)");
        const linked = await table(tx, "external_identities").where({ provider: "google", subject: identity.subject }).first();
        let user;
        if (linked) {
          user = await table(tx, "users").where({ id: linked.user_id, is_active: true }).forShare().first();
          if (!user) throw denied();
        } else {
          const collision = await table(tx, "users").whereRaw("lower(email) = ?", [identity.email]).first();
          if (collision) throw new AppError("account_link_required", "Use your existing sign-in method; automatic linking is disabled", 409);
          user = { id: randomUUID(), email: identity.email, display_name: identity.displayName,
            // Explicit non-password marker: argon2.verify fails closed. No known
            // or recoverable fallback password is created for external accounts.
            password_hash: "!external:google", is_active: true };
          await table(tx, "users").insert(user);
          await table(tx, "external_identities").insert({ id: randomUUID(), provider: "google", subject: identity.subject, user_id: user.id });
          await audit(tx, ctx, { action: "federated_registration", actor_user_id: user.id, event_metadata: { provider: "google" } });
        }
        // Revoke by browser binding, not the possibly stale request cookie. A
        // late older Set-Cookie response can therefore only fail closed.
        await browserService.issue(tx, { user, browser, raw, sessionId });
        await audit(tx, ctx, { action: "federated_login", actor_user_id: user.id, event_metadata: { provider: "google" } });
      });
      cookie(ctx, sessionCookie, raw, 8 * 3600);
      ctx.redirect(`${setup.origin}/login?${new URLSearchParams({ federated: "success", session: sessionId, next: destination })}`);
    } catch (error) {
      // Never reflect provider details, tokens, email or raw error_description.
      const reason = ["provider_cancelled", "account_link_required", "invalid_federated_state"].includes(error.code) ? error.code : "provider_login_failed";
      ctx.redirect(`${setup.origin}/login?${new URLSearchParams({ federated: reason, next: destination })}`);
    }
  }
  async function cancel(ctx) { unavailable(); return browser.cancel(ctx); }
  const { session, currentUser, assertActiveSession, logout } = browser;
  return { providers, prepare, start, callback, cancel, session, currentUser, assertActiveSession, logout };
}
module.exports = { createFederatedAuth, settings, returnPath };
