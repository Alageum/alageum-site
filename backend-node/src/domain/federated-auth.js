"use strict";
const { createHash, randomBytes, randomUUID, timingSafeEqual } = require("node:crypto");
const { AppError } = require("./errors");
const { createGoogleOidc } = require("./google-oidc");
const { createRateLimiter } = require("./rate-limit");
const table = (db, name) => db.withSchema("b2b").table(name);
const hash = value => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const invalid = () => new AppError("invalid_federated_state", "Restart Google sign-in", 401);
const denied = () => new AppError("authentication_required", "Sign in again", 401);
const safeEqual = (left, right) => typeof left === "string" && typeof right === "string" && left.length === right.length && timingSafeEqual(Buffer.from(left), Buffer.from(right));
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function returnPath(value) {
  if (["/admin/catalog", "/b2b", "/b2b/orders", "/b2b/quotes", "/b2b/profile", "/b2b/support", "/b2b/finance", "/b2b/documents", "/inquiry?source=api"].includes(value)) return value;
  if (typeof value === "string" && /^\/b2b\/(?:orders|quotes)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/print)?$/i.test(value)) return value;
  return "/b2b";
}
function settings(config) {
  if (!config.googleEnabled) return null;
  let origin;
  try { origin = new URL(config.browserOrigin); } catch { throw new Error("ALAGEUM_BROWSER_ORIGIN must be a same-origin application URL"); }
  if (origin.origin !== config.browserOrigin || origin.username || origin.password ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) && ["test", "development"].includes(config.env)))) {
    throw new Error("Federated login requires HTTPS (localhost development only)");
  }
  if (typeof config.googleClientId !== "string" || !config.googleClientId.endsWith(".apps.googleusercontent.com") ||
      typeof config.googleClientSecret !== "string" || config.googleClientSecret.length < 16) throw new Error("Google login requires explicit server-side client credentials");
  return { origin: origin.origin, secure: origin.protocol === "https:", redirectUri: `${origin.origin}/api/v1/auth/google/callback` };
}
function createFederatedAuth({ db, config, audit, google, now = Date.now }) {
  const setup = settings(config);
  const provider = setup && (google || createGoogleOidc({ clientId: config.googleClientId, clientSecret: config.googleClientSecret, redirectUri: setup.redirectUri }));
  const limit = createRateLimiter({ limit: 20, now });
  const sessionCookie = setup?.secure ? "__Host-alageum_session" : "alageum_dev_session";
  const attemptCookie = setup?.secure ? "__Host-alageum_google" : "alageum_dev_google";
  const unavailable = () => { if (!setup) throw new AppError("provider_unavailable", "Google sign-in is not configured", 503); };
  const headers = ctx => { ctx.set("Cache-Control", "private, no-store"); ctx.set("Referrer-Policy", "no-referrer"); };
  const cookie = (ctx, name, value, seconds) => ctx.cookies.set(name, value, { httpOnly: true, secure: setup.secure, sameSite: "lax", path: "/", overwrite: true, signed: false, maxAge: seconds * 1000 });
  function sameOrigin(ctx) {
    if (ctx.get("Origin") !== setup.origin) throw new AppError("origin_denied", "Use the same-origin application", 403);
  }
  function providers(ctx) {
    headers(ctx);
    ctx.body = { google: { available: Boolean(setup) }, egov: { available: false, reason: "integration_access_required" } };
  }
  async function prepare(ctx) {
    headers(ctx); unavailable(); sameOrigin(ctx); limit(ctx.ip || "unknown");
    const prior = ctx.cookies.get(attemptCookie, { signed: false });
    const browser = typeof prior === "string" && TOKEN.test(prior) ? prior : random();
    const flowId = randomUUID();
    await table(db, "federated_browsers").insert({ browser_hash: hash(browser), flow_id: flowId,
      state_hash: null, expires_at: new Date(now() + 8 * 3600000) }).onConflict("browser_hash").merge();
    cookie(ctx, attemptCookie, browser, 8 * 3600);
    ctx.body = { flow_id: flowId };
  }
  async function start(ctx) {
    headers(ctx); unavailable(); sameOrigin(ctx); limit(ctx.ip || "unknown");
    const body = ctx.request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["next", "flow_id"].includes(key)) || typeof body.flow_id !== "string" || !UUID.test(body.flow_id)) throw new AppError("validation_error", "Invalid sign-in request", 422);
    const priorBrowser = ctx.cookies.get(attemptCookie, { signed: false });
    if (typeof priorBrowser !== "string" || !TOKEN.test(priorBrowser)) throw invalid();
    const browser = priorBrowser;
    const state = random(), nonce = random(), verifier = random();
    // Cleanup is outside the flow transaction: every mutation locks the browser
    // row before attempt/session rows, preventing an expiry-cleanup lock inversion.
    await table(db, "federated_attempts").where("expires_at", "<=", new Date(now())).delete();
    await table(db, "federated_browsers").where("expires_at", "<=", new Date(now())).delete();
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
    headers(ctx); unavailable(); limit(ctx.ip || "unknown");
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
        // This is bounded development code; distributed signup limits remain a
        // production gate. Never use an email match to attach an identity.
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
        await table(tx, "browser_sessions").where({ browser_hash: hash(browser) }).delete();
        await table(tx, "browser_sessions").where("expires_at", "<=", new Date(now())).delete();
        await table(tx, "browser_sessions").insert({ id: sessionId, token_hash: hash(raw), browser_hash: hash(browser), user_id: user.id, expires_at: new Date(now() + 8 * 3600000) });
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
  async function cancel(ctx) {
    headers(ctx); unavailable(); sameOrigin(ctx); limit(ctx.ip || "unknown");
    const browser = ctx.cookies.get(attemptCookie, { signed: false });
    const flowId = ctx.request.body?.flow_id;
    if (typeof flowId !== "string" || !UUID.test(flowId)) throw invalid();
    if (typeof browser === "string" && TOKEN.test(browser)) await db.transaction(async tx => {
      const flow = await table(tx, "federated_browsers").where({ browser_hash: hash(browser), flow_id: flowId }).forUpdate().first();
      if (!flow) return;
      await table(tx, "federated_browsers").where({ browser_hash: hash(browser) }).update({ state_hash: null, flow_id: randomUUID() });
      await table(tx, "federated_attempts").where({ browser_hash: hash(browser) }).delete();
    });
    ctx.status = 204; ctx.body = null;
  }
  async function readSession(ctx, { requireBoundary = true, connection = db, lock = false } = {}) {
    unavailable();
    const raw = ctx.cookies.get(sessionCookie, { signed: false });
    if (typeof raw !== "string" || !TOKEN.test(raw)) throw denied();
    const query = table(connection, "browser_sessions").where({ token_hash: hash(raw) });
    const session = await (lock ? query.forShare() : query).first();
    if (!session || new Date(session.expires_at).getTime() <= now()) throw denied();
    const boundary = ctx.get("X-Browser-Session");
    if (requireBoundary && (!UUID.test(boundary) || boundary !== session.id)) throw denied();
    if (!["GET", "HEAD"].includes(ctx.method)) sameOrigin(ctx);
    const user = await table(connection, "users").where({ id: session.user_id, is_active: true }).first();
    if (!user) throw denied();
    return { user, session };
  }
  async function currentUser(ctx) { if (!setup) throw denied(); return (await readSession(ctx)).user; }
  async function assertActiveSession(tx, ctx, userId) {
    // Hold only the session row, then acquire domain authorization locks. Do not
    // subsequently acquire a browser-flow row: logout/callback lock that first.
    const { user } = await readSession(ctx, { connection: tx, lock: true });
    if (user.id !== userId) throw denied();
  }
  async function session(ctx) {
    headers(ctx);
    const { user, session: value } = await readSession(ctx, { requireBoundary: false });
    if (typeof ctx.query.session_id !== "string" || !UUID.test(ctx.query.session_id) || ctx.query.session_id !== value.id) throw denied();
    ctx.body = { session_id: value.id, user: { id: user.id, email: user.email, display_name: user.display_name } };
  }
  async function logout(ctx) {
    headers(ctx);
    const { user, session: value } = await readSession(ctx);
    await db.transaction(async tx => {
      await table(tx, "federated_browsers").where({ browser_hash: value.browser_hash }).update({ state_hash: null, flow_id: randomUUID() });
      await table(tx, "federated_attempts").where({ browser_hash: value.browser_hash }).delete();
      await table(tx, "browser_sessions").where({ browser_hash: value.browser_hash }).delete();
      await audit(tx, ctx, { action: "logout", actor_user_id: user.id });
    });
    cookie(ctx, sessionCookie, null, 0);
    ctx.status = 204; ctx.body = null;
  }
  return { providers, prepare, start, callback, cancel, session, currentUser, assertActiveSession, logout };
}
module.exports = { createFederatedAuth, settings, returnPath };
