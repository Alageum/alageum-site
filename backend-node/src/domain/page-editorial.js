"use strict";
const { createHash } = require("node:crypto");
const { errors } = require("@strapi/utils");
const { UID, FIELDS, validatePage } = require("./pages");
const { audit } = require("./audit");
const { lockNativePageAuthority, lockPageConditionCreators } = require("./page-native-authority");
const MARKER = "native-page-draft-publish-v1";
const READS = new Set(["findOne", "findFirst", "findMany", "count"]);
const ACTIONS = { create: "create", update: "update", delete: "delete", publish: "publish", unpublish: "publish", discardDraft: "update" };

// Pinned Strapi register precedes bootstrap, db.init and db.schema.sync. Old
// manual-published data must fail here, before Strapi can transform its schema.
async function preflightPages(strapi) {
  await strapi.db.connection.transaction(async trx => {
    await trx.raw("SELECT pg_advisory_xact_lock(194711, 20261002)");
    const exists = await trx.schema.withSchema("public").hasTable("alageum_pages");
    const hasMarker = await trx.schema.withSchema("b2b").hasTable("editorial_page_schema");
    const marker = hasMarker ? await trx.withSchema("b2b").table("editorial_page_schema").where({ key: MARKER }).first() : null;
    const hasRows = exists && Boolean(await trx.withSchema("public").table("alageum_pages").first("id"));
    const legacy = exists && await trx.schema.withSchema("public").hasColumn("alageum_pages", "published");
    if (hasRows && (!marker || marker.phase !== "ready" || legacy)) throw new Error("Editorial Page migration blocked before schema sync: existing/legacy Page rows require a reviewed manual migration; no rows were changed");
    if (marker && !["pending", "ready"].includes(marker.phase)) throw new Error("Unknown editorial Page migration marker");
    await trx.raw("CREATE SCHEMA IF NOT EXISTS b2b");
    if (!hasMarker) await trx.schema.withSchema("b2b").createTable("editorial_page_schema", table => { table.string("key").primary(); table.string("phase").notNullable(); });
    if (!marker) await trx.withSchema("b2b").table("editorial_page_schema").insert({ key: MARKER, phase: "pending" });
  });
}
async function completePageSchema(strapi) {
  await strapi.db.connection.withSchema("b2b").table("editorial_page_schema").where({ key: MARKER }).update({ phase: "ready" });
}
function summaries(rows) {
  return rows.map(row => ({ published: Boolean(row.publishedAt), updated_at: row.updatedAt, digest: createHash("sha256").update(JSON.stringify(FIELDS.map(field => row[field] ?? null))).digest("hex") })).sort((a, b) => Number(a.published) - Number(b.published));
}
function editorialMiddleware(strapi, recordAudit = audit) {
  return async (context, next) => {
    if (context.uid !== UID || READS.has(context.action)) return next();
    const action = ACTIONS[context.action];
    if (!action) throw new errors.ForbiddenError("This Page operation is not enabled");
    const ctx = strapi.requestContext.get();
    const id = ctx?.state?.user?.id;
    const sessionId = ctx?.state?.session?.id;
    if (ctx?.state?.isAuthenticated !== true || !Number.isSafeInteger(id) || id < 1 || typeof sessionId !== "string" || !sessionId) throw new errors.UnauthorizedError("Native CMS session required for Page writes");
    return strapi.db.transaction(async ({ trx }) => {
      const user = await lockNativePageAuthority(strapi, trx, { adminId: id, sessionId });
      const loadRows = () => context.params.documentId ? strapi.db.query(UID).findMany({ where: { documentId: context.params.documentId }, populate: { createdBy: { populate: ["roles"] } } }) : [];
      let before = await loadRows();
      await lockPageConditionCreators(strapi, trx, before.map(row => row.createdBy?.id).filter(Number.isSafeInteger));
      if (before.length) before = await loadRows();
      const draft = before.find(row => !row.publishedAt);
      const ability = await strapi.admin.services.permission.engine.generateUserAbility(user);
      const checker = strapi.plugin("content-manager").service("permission-checker").create({ userAbility: ability, model: UID });
      if (!checker.can[action](draft)) throw new errors.ForbiddenError("Page permission required");
      if (["create", "update"].includes(context.action)) {
        if (context.params.status === "published") throw new errors.ForbiddenError("Use the native Publish action");
        // Native routing may have sanitized against an earlier ability. Recheck
        // every supplied Page field after locking fresh grants, never silently
        // accept a partially sanitized write after authority changes.
        const input = Object.fromEntries(FIELDS.filter(field => Object.hasOwn(context.params.data || {}, field)).map(field => [field, context.params.data[field]]));
        for (const field of Object.keys(input)) if (!checker.can[action](draft, field)) throw new errors.ForbiddenError(`Page field permission required: ${field}`);
        await checker.validateInput(`plugin::content-manager.explorer.${action}`, input, draft);
      }
      if (["create", "update", "publish"].includes(context.action)) {
        try { validatePage({ locale_code: "ru", ...draft, ...context.params.data }); }
        catch (error) { throw new errors.ValidationError(error.message); }
      }
      const result = await next();
      const documentId = context.params.documentId || result?.documentId;
      const after = documentId ? await strapi.db.query(UID).findMany({ where: { documentId } }) : [];
      await recordAudit(trx, ctx, { action: `page.${context.action}`, entity_type: "page", entity_id: documentId, actor_user_id: null, organization_id: null, event_metadata: { source: "cms", cms_admin_id: String(id), before: summaries(before), after: summaries(after) } });
      return result;
    });
  };
}
module.exports = { MARKER, preflightPages, completePageSchema, editorialMiddleware };
