"use strict";
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const { AppError } = require("./errors");
const { createRateLimiter } = require("./rate-limit");
const table = (db, name) => db.withSchema("b2b").table(name);
const hash = value => createHash("sha256").update(value).digest("hex");
const random = () => randomBytes(32).toString("base64url");
const invalid = () => new AppError("invalid_federated_state", "Restart sign-in", 401);
const denied = () => new AppError("authentication_required", "Sign in again", 401);
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function browserSettings(config) {
  // An unconfigured development API can still serve explicit legacy bearer
  // clients. Cookie endpoints fail closed until a same-origin URL is supplied.
  if (!config.browserOrigin) return null;
  let origin;
  try { origin = new URL(config.browserOrigin); } catch { throw new Error("ALAGEUM_BROWSER_ORIGIN must be a same-origin application URL"); }
  if (origin.origin !== config.browserOrigin || origin.username || origin.password ||
      (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) && ["test", "development"].includes(config.env)))) {
    throw new Error("Browser login requires HTTPS (localhost development only)");
  }
  return { origin: origin.origin, secure: origin.protocol === "https:" };
}

function createBrowserSessions({ db, config, audit, now = Date.now }) {
  const setup = browserSettings(config);
  // Shared by password and Google to prevent cross-method limit/flow bypass.
  // Production startup remains blocked until the distributed policy is ready.
  const limit = createRateLimiter({ limit: 20, now });
  const sessionCookie = setup?.secure ? "__Host-alageum_session" : "alageum_dev_session";
  // Preserve the existing binding cookie so switching sign-in methods shares
  // the same latest-flow lock and invalidates previous sessions consistently.
  const attemptCookie = setup?.secure ? "__Host-alageum_google" : "alageum_dev_google";
  const unavailable = () => { if (!setup) throw new AppError("browser_login_unavailable", "Same-origin browser login is not configured", 503); };
  const headers = ctx => { ctx.set("Cache-Control", "private, no-store"); ctx.set("Referrer-Policy", "no-referrer"); };
  const cookie = (ctx, name, value, seconds) => ctx.cookies.set(name, value, { httpOnly: true, secure: setup.secure, sameSite: "lax", path: "/", overwrite: true, signed: false, maxAge: seconds * 1000 });
  function sameOrigin(ctx) {
    if (ctx.get("Origin") !== setup.origin) throw new AppError("origin_denied", "Use the same-origin application", 403);
  }
  async function prepare(ctx) {
    headers(ctx); unavailable(); sameOrigin(ctx); limit(ctx.ip || "unknown");
    // Cleanup precedes every browser/session lock. Do not sweep other browsers
    // while holding this browser's session row (concurrent relogin deadlock).
    await table(db, "browser_sessions").where("expires_at", "<=", new Date(now())).delete();
    const prior = ctx.cookies.get(attemptCookie, { signed: false });
    const browser = typeof prior === "string" && TOKEN.test(prior) ? prior : random();
    const flowId = randomUUID();
    await table(db, "federated_browsers").insert({ browser_hash: hash(browser), flow_id: flowId,
      state_hash: null, expires_at: new Date(now() + 8 * 3600000) }).onConflict("browser_hash").merge();
    cookie(ctx, attemptCookie, browser, 8 * 3600);
    ctx.body = { flow_id: flowId };
  }
  async function issue(tx, { user, browser, raw, sessionId }) {
    // Caller holds the browser-flow lock before acquiring any session locks.
    // Revocation by binding makes late Set-Cookie responses fail closed.
    await table(tx, "browser_sessions").where({ browser_hash: hash(browser) }).delete();
    await table(tx, "browser_sessions").insert({ id: sessionId, token_hash: hash(raw), browser_hash: hash(browser), user_id: user.id, credential_version: Number(user.credential_version || 0), expires_at: new Date(now() + 8 * 3600000) });
  }
  async function passwordLogin(ctx, verifyCredentials, recheckUser) {
    headers(ctx); unavailable(); sameOrigin(ctx); limit(ctx.ip || "unknown");
    const body = ctx.request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["email", "password", "flow_id"].includes(key)) || typeof body.flow_id !== "string" || !UUID.test(body.flow_id)) {
      throw new AppError("validation_error", "Invalid sign-in request", 422);
    }
    const browser = ctx.cookies.get(attemptCookie, { signed: false });
    if (typeof browser !== "string" || !TOKEN.test(browser)) throw invalid();
    const candidate = await table(db, "federated_browsers").where({ browser_hash: hash(browser), flow_id: body.flow_id }).first();
    if (!candidate || new Date(candidate.expires_at).getTime() <= now()) throw invalid();
    // Expensive Argon2 work holds no DB transaction or browser-flow lock.
    const user = await verifyCredentials({ email: body.email, password: body.password });
    const raw = random(), sessionId = randomUUID();
    await db.transaction(async tx => {
      const flow = await table(tx, "federated_browsers").where({ browser_hash: hash(browser), flow_id: body.flow_id }).forUpdate().first();
      if (!flow || new Date(flow.expires_at).getTime() <= now()) throw invalid();
      // Consume once. Cancel/logout/newer prepare can invalidate this attempt
      // while credentials are being checked, including the same user's login.
      await table(tx, "federated_browsers").where({ browser_hash: hash(browser) }).update({ state_hash: null, flow_id: randomUUID() });
      await table(tx, "federated_attempts").where({ browser_hash: hash(browser) }).delete();
      const active = await recheckUser(tx, user);
      await issue(tx, { user: active, browser, raw, sessionId });
      await audit(tx, ctx, { action: "login", actor_user_id: active.id });
    });
    cookie(ctx, sessionCookie, raw, 8 * 3600);
    ctx.body = { session_id: sessionId, user: { id: user.id, email: user.email, display_name: user.display_name } };
    ctx.status = 200;
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
    const userQuery = table(connection, "users").where({ id: session.user_id, is_active: true });
    const user = await (lock ? userQuery.forShare() : userQuery).first();
    if (!user || Number(session.credential_version || 0) !== Number(user.credential_version || 0)) throw denied();
    return { user, session };
  }
  async function currentUser(ctx) { if (!setup) throw denied(); return (await readSession(ctx)).user; }
  async function assertActiveSession(tx, ctx, userId) {
    // Hold the session and user rows, then acquire domain authorization locks.
    // Never subsequently acquire a browser-flow row: issue/logout lock it first.
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
      // Recheck under the same browser-first lock order used by session issue.
      // A delayed logout from an old tab must not revoke a newer login.
      await table(tx, "federated_browsers").where({ browser_hash: value.browser_hash }).forUpdate().first();
      const owned = await table(tx, "browser_sessions").where({ id: value.id, token_hash: value.token_hash }).forUpdate().first();
      if (!owned) throw denied();
      await table(tx, "federated_browsers").where({ browser_hash: value.browser_hash }).update({ state_hash: null, flow_id: randomUUID() });
      await table(tx, "federated_attempts").where({ browser_hash: value.browser_hash }).delete();
      await table(tx, "browser_sessions").where({ browser_hash: value.browser_hash }).delete();
      await audit(tx, ctx, { action: "logout", actor_user_id: user.id });
    });
    // Do not emit a deletion cookie: a delayed logout response could erase a
    // newer login's cookie. The revoked token is unusable and expires normally.
    ctx.status = 204; ctx.body = null;
  }
  const assertOrigin = ctx => { unavailable(); sameOrigin(ctx); };
  return { setup, prepare, cancel, passwordLogin, assertOrigin, session, currentUser, assertActiveSession, logout,
    headers, cookie, sameOrigin, unavailable, sessionCookie, attemptCookie, issue };
}
module.exports = { createBrowserSessions, browserSettings };
