"use strict";
const { errors } = require("@strapi/utils");
const { validateSessionChain } = require("./cms-catalog");

// All names come from the pinned native metadata, not guessed SQL table names.
function nativeLocks(strapi, trx) {
  const metadata = uid => strapi.db.metadata.get(uid);
  const column = (uid, field) => {
    const name = metadata(uid)?.attributes[field]?.columnName;
    if (!name) throw new Error(`Missing native CMS metadata: ${uid}.${field}`);
    return name;
  };
  const normalize = (uid, row, fields) => Object.fromEntries(fields.map(field => [field, row[column(uid, field)]]));
  async function row(uid, field, value) {
    return trx(metadata(uid).tableName).where({ [column(uid, field)]: value }).forShare().first();
  }
  async function relation(uid, field, ids) {
    if (!ids.length) return [];
    const join = metadata(uid)?.attributes[field]?.joinTable;
    if (!join?.name || !join.joinColumn?.name || !join.inverseJoinColumn?.name) throw new Error(`Unsupported native CMS relation: ${uid}.${field}`);
    const rows = await trx(join.name).whereIn(join.joinColumn.name, ids).orderBy(join.joinColumn.name).orderBy(join.inverseJoinColumn.name).forShare();
    return [...new Set(rows.map(item => item[join.inverseJoinColumn.name]))];
  }
  async function rows(uid, ids) {
    if (!ids.length) return [];
    return trx(metadata(uid).tableName).whereIn(column(uid, "id"), ids).orderBy(column(uid, "id")).forShare();
  }
  async function roles(adminId) {
    const ids = await relation("admin::user", "roles", [adminId]);
    return (await rows("admin::role", ids)).map(item => item[column("admin::role", "id")]);
  }
  return { column, normalize, row, relation, rows, roles };
}
async function lockNativePageAuthority(strapi, trx, principal) {
  const locked = nativeLocks(strapi, trx);
  const userRow = await locked.row("admin::user", "id", principal.adminId);
  const user = userRow && locked.normalize("admin::user", userRow, ["id", "isActive", "blocked"]);
  if (!user || user.isActive !== true || user.blocked === true) throw new errors.UnauthorizedError("Active unblocked native CMS administrator required");
  try {
    await validateSessionChain({
      adminId: user.id, sessionId: principal.sessionId,
      read: async sessionId => {
        const record = await locked.row("admin::session", "sessionId", sessionId);
        return record ? locked.normalize("admin::session", record, ["userId", "origin", "expiresAt", "absoluteExpiresAt", "status", "childId", "deviceId"]) : null;
      },
    });
  } catch (error) {
    if (error.status === 401) throw new errors.UnauthorizedError("Active native CMS session chain required");
    throw error;
  }
  const roleIds = await locked.roles(user.id);
  const permissionIds = await locked.relation("admin::role", "permissions", roleIds);
  const permissions = await locked.rows("admin::permission", permissionIds);
  if (!roleIds.length || !permissions.length) throw new errors.ForbiddenError("Native Page permission required");
  // Query Engine and native permission generation share the enclosing Strapi
  // transaction. Locks above remain held through the write and audit commit.
  return strapi.db.query("admin::user").findOne({ where: { id: user.id }, populate: ["roles"] });
}
async function lockPageConditionCreators(strapi, trx, creatorIds) {
  const locked = nativeLocks(strapi, trx);
  // Native built-in conditions inspect createdBy.id and createdBy.roles. Hold
  // those memberships stable before reloading the subject for fresh CASL checks.
  for (const id of [...new Set(creatorIds)].sort((a, b) => a - b)) {
    await locked.row("admin::user", "id", id);
    await locked.roles(id);
  }
}
module.exports = { lockNativePageAuthority, lockPageConditionCreators };
