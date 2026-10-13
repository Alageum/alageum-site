"use strict";

const { table, privateResponse, assertActiveContext } = require("./auth");
const { categoryUuid, requestPagination } = require("./support");
const READ = "organization.manage_users";

function memberOut(row, organizationId) {
  // The legacy DTO requires plain strings, including blank/non-email text.
  // Keep both LEFT JOIN markers: filtering missing/foreign relationships would
  // silently remove rows and change pagination. Reject the affected page without
  // putting stored identity data or a foreign role label in the error instead.
  if (!row || !["membership_id", "user_id", "role_id"].every(key => typeof row[key] === "string" && categoryUuid(row[key])) ||
      !["email", "display_name", "role_name"].every(key => typeof row[key] === "string") ||
      row.joined_user_id !== row.user_id || row.joined_role_id !== row.role_id ||
      !(row.role_organization_id === null || row.role_organization_id === organizationId))
    throw new TypeError("Invalid organization member DTO");
  return {
    membership_id: row.membership_id, user_id: row.user_id,
    email: row.email, display_name: row.display_name,
    role_id: row.role_id, role_name: row.role_name,
  };
}

function createOrganizationMembers({ db, auth }) {
  async function list(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ), page = requestPagination(ctx);
    ctx.body = await db.transaction(async tx => {
      // Hold the caller's user → membership → organization → role locks, and
      // derive scope again from the fresh context. Global roles do not bypass it.
      const fresh = await assertActiveContext(tx, context, READ);
      const organizationId = fresh.organization_id;
      const count = await table(tx, "memberships").where({ organization_id: organizationId }).count("* AS total").first();
      const total = Number(count.total);
      const rows = page.offset >= BigInt(total) ? [] : await table(tx, "memberships")
        .where("memberships.organization_id", organizationId)
        .leftJoin("users AS target_user", "target_user.id", "memberships.user_id")
        .leftJoin("roles AS target_role", "target_role.id", "memberships.role_id")
        .select("memberships.id AS membership_id", "memberships.user_id", "memberships.role_id",
          "target_user.id AS joined_user_id", "target_user.email", "target_user.display_name",
          "target_role.id AS joined_role_id", "target_role.name AS role_name", "target_role.organization_id AS role_organization_id")
        .orderBy("memberships.created_at", "asc").orderBy("memberships.id", "asc")
        .limit(page.page_size).offset(Number(page.offset));
      // No active filter: inactive target memberships/users remain visible.
      return { items: rows.map(row => memberOut(row, organizationId)), page: page.page, page_size: page.page_size, total };
    });
  }
  return { list };
}

module.exports = { READ, memberOut, createOrganizationMembers };
