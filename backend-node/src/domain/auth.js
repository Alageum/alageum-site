"use strict";

const { createHash, randomBytes, randomUUID } = require("node:crypto");
const jwt = require("jsonwebtoken");
const argon2 = require("argon2");
const { AppError } = require("./errors");
const { pagination, requestPagination } = require("./legacy-query");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PLATFORM_PERMISSIONS = new Set(["catalog.manage"]);
const table = (db, name) => db.withSchema("b2b").table(name);
const fail = (message, details = null) => {
  throw new AppError("validation_error", message, 422, details);
};
const hashToken = (value) => createHash("sha256").update(value).digest("hex");
const timestamps = (t, db) => {
  t.timestamp("created_at", { useTz: true })
    .notNullable()
    .defaultTo(db.fn.now());
  t.timestamp("updated_at", { useTz: true })
    .notNullable()
    .defaultTo(db.fn.now());
};

function strictObject(value, keys, name = "Request") {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    fail(`${name} must be an object`);
  if (Object.keys(value).some((key) => !keys.includes(key)))
    fail(`${name} contains unsupported fields`);
  return value;
}
function uuid(value, name = "ID") {
  if (typeof value !== "string" || !UUID.test(value))
    fail(`${name} must be a UUID`);
  return value.toLowerCase();
}
function header(ctx, name) {
  return typeof ctx.get === "function"
    ? ctx.get(name)
    : (ctx.headers || {})[name.toLowerCase()] || "";
}
function privateResponse(ctx) {
  if (typeof ctx.set === "function")
    ctx.set("Cache-Control", "private, no-store");
}

// Domain tables intentionally live outside Strapi's schema-sync-managed public schema.
async function ensureSchema(db) {
  await db.transaction(async (tx) => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624110)");
    await tx.raw("CREATE SCHEMA IF NOT EXISTS b2b");
    const schema = () => tx.schema.withSchema("b2b");
    if (!(await schema().hasTable("users")))
      await schema().createTable("users", (t) => {
        t.uuid("id").primary();
        t.string("email", 320).notNullable().unique();
        t.text("password_hash").notNullable();
        t.string("display_name", 200).notNullable();
        t.boolean("is_active").notNullable().defaultTo(true);
        t.integer("credential_version").notNullable().defaultTo(0);
        timestamps(t, tx);
      });
    if (!(await schema().hasTable("organizations")))
      await schema().createTable("organizations", (t) => {
        t.uuid("id").primary();
        t.string("name", 240).notNullable();
        t.string("external_id", 200).unique();
        t.boolean("is_active").notNullable().defaultTo(true);
        timestamps(t, tx);
      });
    if (!(await schema().hasTable("roles")))
      await schema().createTable("roles", (t) => {
        t.uuid("id").primary();
        t.uuid("organization_id")
          .references("id")
          .inTable("b2b.organizations")
          .onDelete("CASCADE");
        t.string("code", 100).notNullable();
        t.string("name", 200).notNullable();
        t.jsonb("permissions").notNullable().defaultTo("[]");
        timestamps(t, tx);
        t.unique(["organization_id", "code"]);
      });
    if (!(await schema().hasTable("memberships")))
      await schema().createTable("memberships", (t) => {
        t.uuid("id").primary();
        t.uuid("user_id")
          .notNullable()
          .references("id")
          .inTable("b2b.users")
          .onDelete("CASCADE");
        t.uuid("organization_id")
          .notNullable()
          .references("id")
          .inTable("b2b.organizations")
          .onDelete("CASCADE");
        t.uuid("role_id").notNullable().references("id").inTable("b2b.roles");
        t.boolean("is_active").notNullable().defaultTo(true);
        timestamps(t, tx);
        t.unique(["user_id", "organization_id"]);
        t.index(["organization_id", "is_active"]);
      });
    if (!(await schema().hasTable("refresh_sessions")))
      await schema().createTable("refresh_sessions", (t) => {
        t.uuid("id").primary();
        t.uuid("user_id")
          .notNullable()
          .references("id")
          .inTable("b2b.users")
          .onDelete("CASCADE");
        t.string("token_hash", 64).notNullable().unique();
        t.integer("credential_version").notNullable().defaultTo(0);
        t.uuid("family_id").notNullable().index();
        t.uuid("replaced_by_id")
          .references("id")
          .inTable("b2b.refresh_sessions")
          .onDelete("SET NULL");
        t.timestamp("expires_at", { useTz: true }).notNullable();
        t.timestamp("revoked_at", { useTz: true });
        t.timestamp("created_at", { useTz: true })
          .notNullable()
          .defaultTo(tx.fn.now());
      });
    await tx.raw(
      "CREATE UNIQUE INDEX IF NOT EXISTS roles_global_code_unique ON b2b.roles (code) WHERE organization_id IS NULL",
    );
  });
}

function effectivePermissions(role) {
  // Strapi configures node-postgres to return JSONB as text; standalone Knex returns objects.
  let permissions = role.permissions;
  if (typeof permissions === "string") {
    try {
      permissions = JSON.parse(permissions);
    } catch {
      permissions = [];
    }
  }
  return new Set(
    (Array.isArray(permissions) ? permissions : []).filter(
      (code) =>
        typeof code === "string" &&
        (role.organization_id === null || !PLATFORM_PERMISSIONS.has(code)),
    ),
  );
}

// Recheck and hold the authorization rows when a domain write needs a stable tenant boundary.
async function assertActiveContext(db, context, permission, options = {}) {
  const user = await table(db, "users")
    .where({ id: context.user.id, is_active: true })
    .forShare()
    .first();
  const member = await table(db, "memberships")
    .where({
      id: context.membership.id,
      user_id: context.user.id,
      organization_id: context.organization_id,
      is_active: true,
    })
    .forShare()
    .first();
  if (!user || Number(user.credential_version || 0) !== Number(context.user.credential_version || 0))
    throw new AppError(
      "authentication_required",
      "User is inactive or credentials changed",
      401,
    );
  if (!member)
    throw new AppError(
      "organization_access_denied",
      "No active organization membership",
      403,
    );
  // Choose the strongest required lock at first acquisition. Organization
  // profile writes must never upgrade two concurrent FOR SHARE locks.
  const organizationQuery = table(db, "organizations")
    .where({ id: member.organization_id, is_active: true });
  const organization = await (options.lockOrganizationForUpdate
    ? organizationQuery.forUpdate()
    : organizationQuery.forShare()).first();
  const role = await table(db, "roles")
    .where({ id: member.role_id })
    .forShare()
    .first();
  if (
    !organization ||
    !role ||
    (role.organization_id !== null &&
      role.organization_id !== member.organization_id)
  ) {
    throw new AppError(
      "organization_access_denied",
      "Organization or role is unavailable",
      403,
    );
  }
  const permissions = effectivePermissions(role);
  for (const required of Array.isArray(permission) ? permission : [permission]) {
    if (!permissions.has(required))
      throw new AppError(
        "permission_denied",
        `Permission '${required}' is required`,
        403,
      );
  }
  return {
    user,
    membership: { ...member, role },
    organization,
    organization_id: organization.id,
    permissions,
  };
}

const DEMO = Object.freeze({
  organizationA: "10000000-0000-4000-8000-000000000001",
  organizationB: "10000000-0000-4000-8000-000000000002",
  users: {
    admin: "20000000-0000-4000-8000-000000000001",
    buyer: "20000000-0000-4000-8000-000000000002",
    accountant: "20000000-0000-4000-8000-000000000003",
    engineer: "20000000-0000-4000-8000-000000000004",
    catalog: "20000000-0000-4000-8000-000000000005",
  },
  roles: {
    admin: "30000000-0000-4000-8000-000000000001",
    buyer: "30000000-0000-4000-8000-000000000002",
    accountant: "30000000-0000-4000-8000-000000000003",
    engineer: "30000000-0000-4000-8000-000000000004",
    catalog: "30000000-0000-4000-8000-000000000005",
  },
});
const DEMO_PERMISSIONS = {
  admin: [
    "catalog.read",
    "order.read",
    "order.create",
    "document.read",
    "document.create",
    "finance.read",
    "quote.read",
    "quote.create",
    "ticket.read",
    "ticket.create",
    "organization.manage_users",
    "integration.read",
    "content.manage",
  ],
  buyer: [
    "catalog.read",
    "order.read",
    "document.read",
    "quote.read",
    "quote.create",
    "ticket.read",
    "ticket.create",
  ],
  accountant: ["order.read", "finance.read", "document.read"],
  engineer: [
    "catalog.read",
    "order.read",
    "document.read",
    "ticket.read",
    "ticket.create",
  ],
  catalog: ["catalog.read", "catalog.manage"],
};

function createAuth({ db, config, audit, browserSessions }) {
  if (typeof audit !== "function")
    throw new TypeError("Transactional audit writer is required");
  const invalidToken = () =>
    new AppError("invalid_token", "Token is invalid or expired", 401);
  const accessSeconds = Number(config.accessTokenMinutes || 15) * 60;
  const refreshSeconds = Number(config.refreshTokenDays || 14) * 86400;
  let dummyHash;

  function decodeAccess(token) {
    let payload;
    try {
      payload = jwt.verify(token, config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      });
    } catch {
      throw invalidToken();
    }
    if (
      !payload ||
      typeof payload !== "object" ||
      payload.type !== "access" ||
      typeof payload.sub !== "string" ||
      !UUID.test(payload.sub) ||
      typeof payload.jti !== "string" ||
      !UUID.test(payload.jti) ||
      !["iat", "nbf", "exp"].every((k) => Number.isSafeInteger(payload[k])) ||
      payload.iat > Math.floor(Date.now() / 1000) ||
      payload.exp <= payload.iat ||
      payload.nbf > payload.exp ||
      (payload.cv !== undefined && (!Number.isSafeInteger(payload.cv) || payload.cv < 0))
    )
      throw invalidToken();
    return payload;
  }
  async function pair(tx, user, family = randomUUID(), replaces = null) {
    const now = Math.floor(Date.now() / 1000);
    const raw = randomBytes(48).toString("base64url");
    const id = randomUUID();
    const access = jwt.sign(
      {
        sub: user.id,
        type: "access",
        cv: Number(user.credential_version || 0),
        jti: randomUUID(),
        iat: now,
        nbf: now,
        exp: now + accessSeconds,
      },
      config.jwtSecret,
      {
        algorithm: "HS256",
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
      },
    );
    await table(tx, "refresh_sessions").insert({
      id,
      user_id: user.id,
      token_hash: hashToken(raw),
      credential_version: Number(user.credential_version || 0),
      family_id: family,
      expires_at: new Date(Date.now() + refreshSeconds * 1000),
    });
    if (replaces)
      await table(tx, "refresh_sessions")
        .where({ id: replaces.id })
        .update({ revoked_at: new Date(), replaced_by_id: id });
    return {
      access_token: access,
      refresh_token: raw,
      token_type: "bearer",
      expires_in: accessSeconds,
    };
  }
  function refreshBody(ctx) {
    const body = strictObject(ctx.request.body, ["refresh_token"]);
    if (
      typeof body.refresh_token !== "string" ||
      !/^[A-Za-z0-9_-]{64}$/.test(body.refresh_token)
    )
      throw invalidToken();
    return body.refresh_token;
  }
  async function currentUser(ctx) {
    const authorization = header(ctx, "Authorization");
    if (!authorization && browserSessions) return browserSessions.currentUser(ctx);
    if (!authorization)
      throw new AppError(
        "authentication_required",
        "Authentication required",
        401,
      );
    if (!/^Bearer [^\s]+$/i.test(authorization)) throw invalidToken();
    const payload = decodeAccess(authorization.slice(7));
    const user = await table(db, "users")
      .where({ id: payload.sub, is_active: true })
      .first();
    if (!user || Number(payload.cv || 0) !== Number(user.credential_version || 0))
      throw new AppError(
        "authentication_required",
        "User is inactive or credentials changed",
        401,
      );
    return user;
  }
  async function assertActiveSession(tx, ctx, userId) {
    const authorization = header(ctx, "Authorization");
    if (!authorization) {
      if (!browserSessions?.assertActiveSession) throw invalidToken();
      return browserSessions.assertActiveSession(tx, ctx, userId);
    }
    if (!/^Bearer [^\s]+$/i.test(authorization)) throw invalidToken();
    const payload = decodeAccess(authorization.slice(7));
    if (payload.sub !== userId) throw invalidToken();
    // Reset increments this row without locking sessions. Hold it through the
    // protected write so a password reset cannot race credential authorization.
    const user = await table(tx, "users").where({ id: userId, is_active: true }).forShare().first();
    if (!user || Number(payload.cv || 0) !== Number(user.credential_version || 0)) throw invalidToken();
  }
  async function context(ctx) {
    const user = await currentUser(ctx);
    const selected = header(ctx, "X-Organization-ID");
    if (selected) uuid(selected, "X-Organization-ID");
    let query = table(db, "memberships").where({
      user_id: user.id,
      is_active: true,
    });
    if (selected) query = query.where({ organization_id: selected });
    const memberships = await query;
    if (!memberships.length)
      throw new AppError(
        "organization_access_denied",
        "No active organization membership",
        403,
      );
    if (memberships.length > 1 && !selected)
      throw new AppError(
        "organization_required",
        "X-Organization-ID header is required",
        400,
      );
    const membership = memberships[0];
    const [organization, role] = await Promise.all([
      table(db, "organizations")
        .where({ id: membership.organization_id, is_active: true })
        .first(),
      table(db, "roles").where({ id: membership.role_id }).first(),
    ]);
    if (
      !organization ||
      !role ||
      (role.organization_id !== null &&
        role.organization_id !== membership.organization_id)
    ) {
      throw new AppError(
        "organization_access_denied",
        "Organization or role is unavailable",
        403,
      );
    }
    const result = {
      user,
      membership: { ...membership, role },
      organization,
      organization_id: organization.id,
      permissions: effectivePermissions(role),
    };
    ctx.state = ctx.state || {};
    ctx.state.auth = result;
    return result;
  }
  async function permission(ctx, code) {
    const result = await context(ctx);
    if (!result.permissions.has(code))
      throw new AppError(
        "permission_denied",
        `Permission '${code}' is required`,
        403,
      );
    return result;
  }
  async function verifyCredentials(input) {
    const body = strictObject(input, ["email", "password"]);
    if (
      typeof body.email !== "string" ||
      body.email.length > 320 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
    )
      fail("A valid email is required");
    if (
      typeof body.password !== "string" ||
      body.password.length < 8 ||
      body.password.length > 256
    )
      fail("Password length must be between 8 and 256");
    const user = await table(db, "users")
      .where({ email: body.email.toLowerCase() })
      .first();
    if (!dummyHash) dummyHash = argon2.hash(randomBytes(32).toString("hex"));
    let valid = false;
    try {
      valid = await argon2.verify(
        user ? user.password_hash : await dummyHash,
        body.password,
      );
    } catch {
      /* Corrupt hashes fail closed. */
    }
    if (!user || !user.is_active || !valid)
      throw new AppError(
        "invalid_credentials",
        "Email or password is incorrect",
        401,
      );
    return user;
  }
  async function recheckUser(tx, user) {
    const active = await table(tx, "users").where({ id: user.id, is_active: true }).forShare().first();
    if (!active || active.password_hash !== user.password_hash || Number(active.credential_version || 0) !== Number(user.credential_version || 0)) {
      throw new AppError("invalid_credentials", "Email or password is incorrect", 401);
    }
    return active;
  }
  async function login(ctx) {
    const user = await verifyCredentials(ctx.request.body);
    ctx.body = await db.transaction(async tx => {
      const active = await recheckUser(tx, user);
      const result = await pair(tx, active);
      await audit(tx, ctx, { action: "login", actor_user_id: active.id });
      return result;
    });
    privateResponse(ctx);
    ctx.status = 200;
  }
  async function browserLogin(ctx) {
    if (!browserSessions?.passwordLogin) throw new AppError("browser_login_unavailable", "Browser login is not configured", 503);
    return browserSessions.passwordLogin(ctx, verifyCredentials, recheckUser);
  }
  async function refresh(ctx) {
    const raw = refreshBody(ctx);
    ctx.body = await db.transaction(async (tx) => {
      const stored = await table(tx, "refresh_sessions")
        .where({ token_hash: hashToken(raw) })
        .forUpdate()
        .first();
      if (
        !stored ||
        stored.revoked_at ||
        new Date(stored.expires_at).getTime() <= Date.now()
      )
        throw invalidToken();
      const user = await table(tx, "users")
        .where({ id: stored.user_id, is_active: true })
        .forShare()
        .first();
      if (!user || Number(stored.credential_version || 0) !== Number(user.credential_version || 0)) throw invalidToken();
      return pair(tx, user, stored.family_id, stored);
    });
    privateResponse(ctx);
    ctx.status = 200;
  }
  async function logout(ctx) {
    const raw = refreshBody(ctx);
    await db.transaction(async (tx) => {
      const stored = await table(tx, "refresh_sessions")
        .where({ token_hash: hashToken(raw) })
        .forUpdate()
        .first();
      if (stored && !stored.revoked_at) {
        await table(tx, "refresh_sessions")
          .where({ id: stored.id })
          .update({ revoked_at: new Date() });
        await audit(tx, ctx, {
          action: "logout",
          actor_user_id: stored.user_id,
        });
      }
    });
    privateResponse(ctx);
    ctx.status = 204;
    ctx.body = null;
  }
  async function me(ctx) {
    const auth = await context(ctx);
    ctx.body = {
      user: {
        id: auth.user.id,
        email: auth.user.email,
        display_name: auth.user.display_name,
      },
      organization: { id: auth.organization.id, name: auth.organization.name },
      permissions: [...auth.permissions].sort(),
    };
    privateResponse(ctx);
    ctx.status = 200;
  }
  async function organizations(ctx) {
    const user = await currentUser(ctx);
    const page = requestPagination(ctx);
    const memberships = await table(db, "memberships")
      .where({ user_id: user.id, is_active: true })
      .orderBy("created_at")
      .orderBy("id");
    const items = [];
    for (const member of memberships) {
      const [org, role] = await Promise.all([
        table(db, "organizations")
          .where({ id: member.organization_id, is_active: true })
          .first(),
        table(db, "roles").where({ id: member.role_id }).first(),
      ]);
      if (
        org &&
        role &&
        (role.organization_id === null || role.organization_id === org.id)
      )
        items.push({
          id: member.id,
          organization_id: org.id,
          organization_name: org.name,
          role_id: role.id,
          role_name: role.name,
          permissions: [...effectivePermissions(role)].sort(),
        });
    }
    ctx.body = {
      items: page.offset >= BigInt(items.length)
        ? []
        : items.slice(Number(page.offset), Number(page.offset) + page.page_size),
      page: page.page,
      page_size: page.page_size,
      total: items.length,
    };
    privateResponse(ctx);
    ctx.status = 200;
  }
  async function seed() {
    if (config.seedDemo !== true) return { seeded: false };
    if (!["development", "test"].includes(config.env))
      throw new Error(
        "Demo authentication seed is disabled outside development/test",
      );
    return db.transaction(async (tx) => {
      await tx.raw("SELECT pg_advisory_xact_lock(731624111)");
      if (await table(tx, "users").first("id")) return { seeded: false };
      const password_hash = await argon2.hash("ChangeMe123!");
      await table(tx, "organizations").insert([
        {
          id: DEMO.organizationA,
          name: "Demo Industrial Company",
          external_id: "DEMO-ORG-A",
        },
        {
          id: DEMO.organizationB,
          name: "Demo Supplier",
          external_id: "DEMO-ORG-B",
        },
      ]);
      for (const [index, name] of Object.keys(DEMO.users).entries()) {
        const organization_id =
          name === "accountant" ? DEMO.organizationB : DEMO.organizationA;
        await table(tx, "roles").insert({
          id: DEMO.roles[name],
          organization_id: name === "catalog" ? null : organization_id,
          code: name === "catalog" ? "platform_catalog_manager" : `dev_${name}`,
          name: name === "catalog" ? "Platform catalog manager" : `DEV ${name}`,
          permissions: JSON.stringify(DEMO_PERMISSIONS[name]),
        });
        await table(tx, "users").insert({
          id: DEMO.users[name],
          email: `${name}@demo.example`,
          display_name: `Demo ${name === "catalog" ? "Catalog Manager" : name.charAt(0).toUpperCase() + name.slice(1)}`,
          password_hash,
        });
        await table(tx, "memberships").insert({
          id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
          user_id: DEMO.users[name],
          organization_id,
          role_id: DEMO.roles[name],
        });
      }
      return { seeded: true };
    });
  }
  return {
    login,
    browserLogin,
    refresh,
    logout,
    me,
    organizations,
    context,
    permission,
    currentUser,
    assertActiveSession,
    seed,
    decodeAccess,
  };
}

module.exports = {
  ensureSchema,
  createAuth,
  assertActiveContext,
  effectivePermissions,
  table,
  UUID,
  uuid,
  strictObject,
  pagination,
  header,
  privateResponse,
  DEMO,
};
