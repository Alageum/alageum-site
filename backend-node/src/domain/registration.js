"use strict";
const { createHash, randomBytes, randomUUID } = require("node:crypto");
const argon2 = require("argon2");
const { AppError } = require("./errors");
const { table, strictObject, uuid, privateResponse, assertActiveContext } = require("./auth");
const { createRegistrationRateLimiter } = require("./registration-rate-limit");
const { createRegistrationMail, createMailOutbox, mailbox } = require("./registration-mail");
const MANAGE = "organization.manage_users";
const ACCEPTED = Object.freeze({ status: "accepted", message: "If this address is eligible, an email will be sent. Check your inbox and spam folder." });
const hashToken = token => createHash("sha256").update(token).digest("hex");
const fail = message => { throw new AppError("validation_error", message, 422); };
function emailValue(value) {
  if (typeof value !== "string") fail("A valid email is required");
  const email = value.trim().toLowerCase();
  if (!mailbox(email)) fail("A valid email is required");
  return email;
}
function passwordValue(value) {
  if (typeof value !== "string" || value.length < 12 || value.length > 128) fail("Password length must be between 12 and 128");
  return value;
}
function textValue(value, name, maximum, required = true) {
  if (value === undefined && !required) return "";
  if (typeof value !== "string" || (required && !value.trim()) || value.trim().length > maximum || /[\u0000-\u001f\u007f]/.test(value)) fail(`${name} is invalid`);
  return value.trim();
}
function invalidToken() { return new AppError("invalid_token", "The link is invalid or expired. Request a new link.", 400); }
function tokenValue(value) { if (typeof value !== "string" || !/^[A-Za-z0-9_-]{64}$/.test(value)) throw invalidToken(); return value; }
function requestOut(row) {
  return { id: row.id, company_name: row.company_name, company_identifier: row.company_identifier, message: row.message,
    status: row.status, created_at: row.created_at, decided_at: row.decided_at || null, decision_reason: row.decision_reason || null };
}
function assignableRole(role, context) {
  if (!role || role.organization_id !== context.organization_id) return false;
  let permissions;
  try { permissions = typeof role.permissions === "string" ? JSON.parse(role.permissions) : role.permissions; } catch { return false; }
  return Array.isArray(permissions) && permissions.every(code => typeof code === "string" && code !== "catalog.manage" && context.permissions.has(code));
}
function createRegistration({ db, auth, config, audit, browserSessions, mail: suppliedMail, now = Date.now, rateLimit, passwordHash = value => argon2.hash(value, { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }) }) {
  if (typeof audit !== "function" || typeof browserSessions?.assertOrigin !== "function") throw new TypeError("Audit and same-origin browser session services are required");
  const mail = suppliedMail || createRegistrationMail({ config });
  const outbox = createMailOutbox({ db, config, mail, audit, now });
  const limit = rateLimit || createRegistrationRateLimiter({ db, secret: config.jwtSecret, now });
  const response = (ctx, body, status = 200) => { privateResponse(ctx); ctx.body = body; ctx.status = status; };
  function publicWrite(ctx) { privateResponse(ctx); browserSessions.assertOrigin(ctx); }
  async function issue(tx, user, purpose) {
    const token = randomBytes(48).toString("base64url"), id = randomUUID();
    const expiresAt = new Date(now() + (purpose === "verify" ? 86400000 : 1800000));
    await table(tx, "account_tokens").where({ user_id: user.id, purpose }).whereNull("consumed_at").update({ consumed_at: new Date(now()) });
    await table(tx, "account_tokens").insert({ id, user_id: user.id, purpose, token_hash: hashToken(token), expires_at: expiresAt });
    await outbox.enqueue(tx, { tokenId: id, email: user.email, purpose, token, expiresAt });
  }
  async function register(ctx) {
    publicWrite(ctx);
    const body = strictObject(ctx.request.body, ["email", "password", "display_name"]);
    const email = emailValue(body.email), password = passwordValue(body.password), displayName = textValue(body.display_name, "Display name", 200);
    await limit(ctx, "mail", email);
    mail.assertConfigured();
    // Hash on both new and duplicate requests; neither body nor SMTP timing reveals existence.
    const passwordHashValue = await passwordHash(password);
    await db.transaction(async tx => {
      await tx.raw("SELECT pg_advisory_xact_lock(731624128, hashtext(?))", [email]);
      if (await table(tx, "users").whereRaw("lower(trim(email)) = ?", [email]).first()) return;
      const user = { id: randomUUID(), email, password_hash: passwordHashValue, display_name: displayName, is_active: false, credential_version: 0 };
      // The normalized unique index is the final authority, including concurrent non-signup writers.
      const inserted = await table(tx, "users").insert(user).onConflict().ignore().returning("id");
      if (!inserted.length) return;
      await table(tx, "registration_profiles").insert({ user_id: user.id });
      await issue(tx, user, "verify");
      await audit(tx, ctx, { action: "account_registered", actor_user_id: user.id });
    });
    response(ctx, { ...ACCEPTED }, 202);
  }
  async function requestMail(ctx, purpose) {
    publicWrite(ctx);
    const email = emailValue(strictObject(ctx.request.body, ["email"]).email);
    await limit(ctx, "mail", email);
    mail.assertConfigured();
    await db.transaction(async tx => {
      const user = await table(tx, "users").whereRaw("lower(trim(email)) = ?", [email]).forUpdate().first();
      if (!user) return;
      const profile = await table(tx, "registration_profiles").where({ user_id: user.id }).first();
      if (purpose === "verify" ? (!profile || profile.verified_at || user.is_active) : (!user.is_active || (profile && !profile.verified_at))) return;
      await issue(tx, user, purpose);
      await audit(tx, ctx, { action: purpose === "verify" ? "email_verification_requested" : "password_reset_requested", actor_user_id: user.id });
    });
    response(ctx, { ...ACCEPTED }, 202);
  }
  async function consume(ctx, purpose, update) {
    publicWrite(ctx);
    const body = strictObject(ctx.request.body, purpose === "reset" ? ["token", "password"] : ["token"]);
    await limit(ctx, "token");
    const token = tokenValue(body.token);
    const passwordHashValue = purpose === "reset" ? await passwordHash(passwordValue(body.password)) : null;
    await db.transaction(async tx => {
      const candidate = await table(tx, "account_tokens").where({ token_hash: hashToken(token), purpose }).first();
      if (!candidate) throw invalidToken();
      // All token operations lock user first, then token, avoiding verify/resend/reset races.
      const user = await table(tx, "users").where({ id: candidate.user_id }).forUpdate().first();
      const stored = await table(tx, "account_tokens").where({ id: candidate.id }).forUpdate().first();
      if (!user || !stored || stored.consumed_at || new Date(stored.expires_at).getTime() <= now()) throw invalidToken();
      const profile = await table(tx, "registration_profiles").where({ user_id: user.id }).forUpdate().first();
      await update(tx, user, profile, passwordHashValue);
      await table(tx, "account_tokens").where({ user_id: user.id, purpose }).whereNull("consumed_at").update({ consumed_at: new Date(now()) });
      await audit(tx, ctx, { action: purpose === "verify" ? "email_verified" : "password_reset", actor_user_id: user.id });
    });
    response(ctx, { status: purpose === "verify" ? "verified" : "password_reset" });
  }
  async function verifyEmail(ctx) {
    return consume(ctx, "verify", async (tx, user, profile) => {
      if (!profile || profile.verified_at || user.is_active) throw invalidToken();
      await table(tx, "registration_profiles").where({ user_id: user.id }).update({ verified_at: new Date(now()) });
      await table(tx, "users").where({ id: user.id }).update({ is_active: true, updated_at: new Date(now()) });
    });
  }
  async function resetPassword(ctx) {
    return consume(ctx, "reset", async (tx, user, profile, passwordHashValue) => {
      if (!user.is_active || (profile && !profile.verified_at)) throw invalidToken();
      await table(tx, "users").where({ id: user.id }).update({ password_hash: passwordHashValue, credential_version: tx.raw("credential_version + 1"), updated_at: new Date(now()) });
      // Sessions and bearer tokens compare their captured version on every use.
      // Do not take session-row locks while holding a user lock (opposite login order).
    });
  }
  async function account(ctx) {
    privateResponse(ctx);
    const user = await auth.currentUser(ctx);
    const requests = await table(db, "company_access_requests").where({ user_id: user.id }).orderBy("created_at", "desc").limit(100);
    const memberships = await table(db, "memberships").where({ user_id: user.id, is_active: true });
    let activeMembership = false;
    for (const member of memberships) {
      const [org, role] = await Promise.all([table(db, "organizations").where({ id: member.organization_id, is_active: true }).first(), table(db, "roles").where({ id: member.role_id }).first()]);
      if (org && role && (role.organization_id === null || role.organization_id === org.id)) { activeMembership = true; break; }
    }
    response(ctx, { user: { id: user.id, email: user.email, display_name: user.display_name }, email_verified: true,
      onboarding_status: activeMembership ? "approved" : requests.some(row => row.status === "pending") ? "pending" : requests[0]?.status === "rejected" ? "rejected" : "no_company",
      company_requests: requests.map(requestOut), permissions: [] });
  }
  async function requestCompanyAccess(ctx) {
    publicWrite(ctx);
    const body = strictObject(ctx.request.body, ["company_name", "company_identifier", "message"]);
    const companyName = textValue(body.company_name, "Company name", 240), identifier = textValue(body.company_identifier, "Company identifier", 200), message = textValue(body.message, "Message", 2000, false);
    const user = await auth.currentUser(ctx);
    await limit(ctx, "company", user.id);
    const result = await db.transaction(async tx => {
      await tx.raw("SELECT pg_advisory_xact_lock(731624129, hashtext(?))", [user.id]);
      await auth.assertActiveSession(tx, ctx, user.id);
      const fresh = await table(tx, "users").where({ id: user.id, is_active: true }).forShare().first();
      if (!fresh) throw new AppError("authentication_required", "Authentication required", 401);
      const existing = await table(tx, "company_access_requests").where({ user_id: user.id, company_identifier: identifier, status: "pending" }).first();
      if (existing) return existing;
      const count = await table(tx, "company_access_requests").where({ user_id: user.id, status: "pending" }).count("* AS total").first();
      if (Number(count.total) >= 10) throw new AppError("request_limit", "Too many pending company requests", 409);
      const organization = await table(tx, "organizations").where({ external_id: identifier, is_active: true }).forShare().first();
      const row = { id: randomUUID(), user_id: user.id, organization_id: organization?.id || null, company_name: companyName, company_identifier: identifier, message, status: "pending", created_at: new Date(now()) };
      await table(tx, "company_access_requests").insert(row);
      await audit(tx, ctx, { action: "company_access_requested", actor_user_id: user.id, organization_id: row.organization_id, entity_type: "company_access_request", entity_id: row.id });
      return row;
    });
    response(ctx, { request: requestOut(result) }, 201);
  }
  async function accessRequests(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, MANAGE);
    const result = await db.transaction(async tx => {
      await auth.assertActiveSession(tx, ctx, context.user.id);
      const fresh = await assertActiveContext(tx, context, MANAGE);
      const rows = await table(tx, "company_access_requests").where({ organization_id: fresh.organization_id }).orderBy("created_at", "desc").limit(100);
      const items = [];
      for (const row of rows) {
        const user = await table(tx, "users").where({ id: row.user_id }).first();
        items.push({ ...requestOut(row), user: { id: user.id, email: user.email, display_name: user.display_name } });
      }
      return { items };
    });
    response(ctx, result);
  }
  async function accessRoles(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, MANAGE);
    const result = await db.transaction(async tx => {
      await auth.assertActiveSession(tx, ctx, context.user.id);
      const fresh = await assertActiveContext(tx, context, MANAGE);
      const roles = await table(tx, "roles").where({ organization_id: fresh.organization_id }).orderBy("name");
      return { items: roles.filter(role => assignableRole(role, fresh)).map(role => ({ id: role.id, name: role.name, code: role.code })) };
    });
    response(ctx, result);
  }
  async function decideAccess(ctx, approve) {
    publicWrite(ctx);
    const id = uuid(ctx.params.id), body = strictObject(ctx.request.body, approve ? ["role_id"] : ["reason"]);
    const roleId = approve ? uuid(body.role_id, "Role ID") : null, reason = approve ? "" : textValue(body.reason, "Reason", 1000, false);
    const context = await auth.permission(ctx, MANAGE);
    const result = await db.transaction(async tx => {
      await auth.assertActiveSession(tx, ctx, context.user.id);
      const fresh = await assertActiveContext(tx, context, MANAGE);
      const request = await table(tx, "company_access_requests").where({ id, organization_id: fresh.organization_id }).forUpdate().first();
      if (!request) throw new AppError("not_found", "Request not found", 404);
      if (request.user_id === fresh.user.id) throw new AppError("permission_denied", "You cannot decide your own request", 403);
      if (request.status !== "pending") throw new AppError("request_already_decided", "Request has already been decided", 409);
      if (approve) {
        const target = await table(tx, "users").where({ id: request.user_id, is_active: true }).forShare().first();
        const profile = await table(tx, "registration_profiles").where({ user_id: request.user_id }).first();
        if (!target || (profile && !profile.verified_at)) throw new AppError("request_unavailable", "Applicant is unavailable", 409);
        const role = await table(tx, "roles").where({ id: roleId }).forShare().first();
        if (!assignableRole(role, fresh)) throw new AppError("permission_denied", "Role is outside your organization or authority", 403);
        // This is a read-and-reject check, not an update. Taking a target FOR UPDATE
        // lock would deadlock two managers reviewing each other; the insert
        // unique constraint below is the authority for a concurrent new grant.
        const membership = await table(tx, "memberships").where({ user_id: request.user_id, organization_id: fresh.organization_id }).first();
        if (membership) throw new AppError("membership_exists", "An existing membership must be managed separately", 409);
        const inserted = await table(tx, "memberships").insert({ id: randomUUID(), user_id: request.user_id, organization_id: fresh.organization_id, role_id: role.id, is_active: true }).onConflict(["user_id", "organization_id"]).ignore().returning("id");
        if (!inserted.length) throw new AppError("membership_exists", "An existing membership must be managed separately", 409);
      }
      const changes = { status: approve ? "approved" : "rejected", decided_by: fresh.user.id, decided_at: new Date(now()), decision_reason: reason || null };
      await table(tx, "company_access_requests").where({ id }).update(changes);
      await audit(tx, ctx, { action: approve ? "company_access_approved" : "company_access_rejected", actor_user_id: fresh.user.id, organization_id: fresh.organization_id, entity_type: "company_access_request", entity_id: id, event_metadata: approve ? { role_id: roleId } : {} });
      return { ...request, ...changes };
    });
    response(ctx, { request: requestOut(result) });
  }
  return { register, verifyEmail, resendVerification: ctx => requestMail(ctx, "verify"), forgotPassword: ctx => requestMail(ctx, "reset"), resetPassword,
    account, requestCompanyAccess, accessRequests, accessRoles, approveAccess: ctx => decideAccess(ctx, true), rejectAccess: ctx => decideAccess(ctx, false),
    startMailWorker: outbox.start, stopMailWorker: outbox.stop, flushMail: outbox.flush, mailWorkerStatus: outbox.status };
}
module.exports = { createRegistration, emailValue, passwordValue, textValue, tokenValue, hashToken, requestOut, assignableRole, ACCEPTED };
