"use strict";

const { AppError } = require("./errors");
const ACTION = "plugin::alageum-catalog.manage";
const PLUGIN_ID = "alageum-catalog";

function json(value, fallback) {
  if (value === null || value === undefined) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function unconstrained(permission) {
  const conditions = json(permission.conditions, []);
  const properties = json(permission.properties, {});
  const parameters = json(permission.actionParameters, {});
  // This is a global catalog action. Conditional or field-restricted grants must
  // never accidentally expand into an unrestricted editor permission.
  return (
    permission.action === ACTION &&
    !permission.subject &&
    Array.isArray(conditions) &&
    conditions.length === 0 &&
    properties &&
    typeof properties === "object" &&
    !Array.isArray(properties) &&
    Object.keys(properties).length === 0 &&
    parameters &&
    typeof parameters === "object" &&
    !Array.isArray(parameters) &&
    Object.keys(parameters).length === 0
  );
}

const MAX_SESSION_CHAIN = 64;
async function validateSessionChain({
  read,
  sessionId,
  adminId,
  now = Date.now(),
}) {
  const invalid = () =>
    new AppError("authentication_required", "Active CMS session required", 401);
  const seen = new Set();
  let currentId = sessionId;
  let deviceId;
  for (let depth = 0; depth < MAX_SESSION_CHAIN; depth++) {
    if (typeof currentId !== "string" || !currentId || seen.has(currentId))
      throw invalid();
    seen.add(currentId);
    const session = await read(currentId);
    if (!session) throw invalid();
    const expires = new Date(session.expiresAt).getTime();
    const absolute = session.absoluteExpiresAt
      ? new Date(session.absoluteExpiresAt).getTime()
      : expires;
    if (
      session.origin !== "admin" ||
      String(session.userId) !== String(adminId) ||
      !Number.isFinite(expires) ||
      expires <= now ||
      !Number.isFinite(absolute) ||
      absolute <= now ||
      typeof session.deviceId !== "string" ||
      !session.deviceId ||
      (deviceId !== undefined && session.deviceId !== deviceId)
    )
      throw invalid();
    deviceId = session.deviceId;
    if (session.status === "active" && !session.childId) return session;
    if (session.status !== "rotated" || !session.childId) throw invalid();
    currentId = session.childId;
  }
  throw invalid();
}

function createCmsCatalogAuthorizer({ strapi }) {
  const db = strapi.db.connection;
  const metadata = (uid) => strapi.db.metadata.get(uid);
  const column = (uid, field) => {
    const result = metadata(uid)?.attributes[field]?.columnName;
    if (!result)
      throw new Error(`Missing native CMS metadata: ${uid}.${field}`);
    return result;
  };
  const normalize = (uid, row, fields) =>
    Object.fromEntries(fields.map((field) => [field, row[column(uid, field)]]));

  async function relation(tx, uid, field, ids) {
    const join = metadata(uid)?.attributes[field]?.joinTable;
    if (
      !join?.name ||
      !join.joinColumn?.name ||
      !join.inverseJoinColumn?.name
    ) {
      throw new Error(
        `Unsupported native CMS relation metadata: ${uid}.${field}`,
      );
    }
    const rows = await tx(join.name)
      .whereIn(join.joinColumn.name, ids)
      .orderBy(join.joinColumn.name)
      .orderBy(join.inverseJoinColumn.name)
      .forShare();
    return [...new Set(rows.map((row) => row[join.inverseJoinColumn.name]))];
  }

  async function load(tx, principal) {
    const denied = () =>
      new AppError(
        "permission_denied",
        "CMS catalog management permission is required",
        403,
      );
    const userRow = await tx(metadata("admin::user").tableName)
      .where({ [column("admin::user", "id")]: principal.adminId })
      .forShare()
      .first();
    if (!userRow)
      throw new AppError(
        "authentication_required",
        "Active CMS administrator required",
        401,
      );
    const user = normalize("admin::user", userRow, [
      "id",
      "isActive",
      "blocked",
    ]);
    if (user.isActive !== true || user.blocked === true) {
      throw new AppError(
        "authentication_required",
        "Active CMS administrator required",
        401,
      );
    }
    // Native Strapi keeps rotated parent records. An old access token is valid
    // only while its complete locked lineage still ends in a live session.
    // Otherwise revoking the current child would leave old parent bearers usable.
    await validateSessionChain({
      sessionId: principal.sessionId,
      adminId: user.id,
      read: async (sessionId) => {
        const row = await tx(metadata("admin::session").tableName)
          .where({ [column("admin::session", "sessionId")]: sessionId })
          .forShare()
          .first();
        return row
          ? normalize("admin::session", row, [
              "userId",
              "origin",
              "expiresAt",
              "absoluteExpiresAt",
              "status",
              "childId",
              "deviceId",
            ])
          : null;
      },
    });
    const roleIds = await relation(tx, "admin::user", "roles", [user.id]);
    if (!roleIds.length) throw denied();
    const roleRows = await tx(metadata("admin::role").tableName)
      .whereIn(column("admin::role", "id"), roleIds)
      .orderBy(column("admin::role", "id"))
      .forShare();
    const actualRoles = roleRows.map((row) => row[column("admin::role", "id")]);
    if (!actualRoles.length) throw denied();
    const permissionIds = await relation(
      tx,
      "admin::role",
      "permissions",
      actualRoles,
    );
    if (!permissionIds.length) throw denied();
    const permissionRows = await tx(metadata("admin::permission").tableName)
      .whereIn(column("admin::permission", "id"), permissionIds)
      .where(column("admin::permission", "action"), ACTION)
      .orderBy(column("admin::permission", "id"))
      .forShare();
    const permissions = permissionRows.map((row) =>
      normalize("admin::permission", row, [
        "action",
        "subject",
        "conditions",
        "properties",
        "actionParameters",
      ]),
    );
    if (!permissions.some(unconstrained)) throw denied();
    return { adminId: user.id, sessionId: principal.sessionId };
  }

  async function manager(ctx) {
    const id = ctx.state?.user?.id;
    const sessionId = ctx.state?.session?.id;
    if (
      ctx.state?.isAuthenticated !== true ||
      !Number.isSafeInteger(id) ||
      id < 1 ||
      typeof sessionId !== "string" ||
      sessionId.length === 0
    ) {
      throw new AppError(
        "authentication_required",
        "CMS administrator session required",
        401,
      );
    }
    return db.transaction((tx) => load(tx, { adminId: id, sessionId }));
  }
  return {
    manager,
    writeAuthorization: load,
    auditIdentity: (principal) => ({
      actor_user_id: null,
      organization_id: null,
      event_metadata: {
        source: "cms",
        cms_admin_id: String(principal.adminId),
      },
    }),
  };
}

module.exports = {
  createCmsCatalogAuthorizer,
  ACTION,
  PLUGIN_ID,
  unconstrained,
  validateSessionChain,
  MAX_SESSION_CHAIN,
};
