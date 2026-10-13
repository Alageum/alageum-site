"use strict";

const { AppError } = require("./errors");
const { table, strictObject, privateResponse, assertActiveContext } = require("./auth");

const READ = "organization.profile.read";
const UPDATE = "organization.profile.update";
const LIMITS = Object.freeze({
  name: 240,
  business_contact_name: 200,
  business_contact_email: 320,
  business_contact_phone: 80,
  business_address: 2000,
});
const FIELDS = Object.keys(LIMITS);
const CONTACT_FIELDS = FIELDS.filter((field) => field !== "name");
const MAX_VERSION = 2147483647;
const invalid = (message) => { throw new AppError("validation_error", message, 422); };

function validatePatch(input) {
  strictObject(input, ["version", ...FIELDS]);
  if (!Number.isInteger(input.version) || input.version < 0 || input.version > MAX_VERSION)
    invalid("version must be a non-negative 32-bit integer");
  const fields = {};
  for (const field of FIELDS) {
    if (!Object.hasOwn(input, field)) continue;
    const value = input[field];
    if (value === null && field !== "name") { fields[field] = null; continue; }
    if (typeof value !== "string") invalid(`${field} must be a string${field === "name" ? "" : " or null"}`);
    const normalized = value.trim();
    // Keep original spelling, freeform international phone punctuation and
    // address line breaks. Reject NUL/other control characters PostgreSQL or
    // a single-line field cannot represent safely; no country assumptions.
    const controls = field === "business_address" ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u : /[\u0000-\u001F\u007F]/u;
    if (controls.test(normalized) || normalized.length > LIMITS[field]) invalid(`Invalid ${field}`);
    if (!normalized && field === "name") invalid("name must not be blank");
    if (field === "business_contact_email" && normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized))
      invalid("business_contact_email must be a valid email address");
    fields[field] = normalized || null;
  }
  if (!Object.keys(fields).length) invalid("At least one editable profile field is required");
  return { version: input.version, fields };
}

// This table is additive and is never managed by generated Strapi CRUD/sync.
// Existing incompatible structures require an explicit reviewed migration.
async function verifySchema(db) {
  const relation = await db.raw("SELECT c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='b2b' AND c.relname='organization_profiles'");
  if (relation.rows.length !== 1 || relation.rows[0].relkind !== "r") throw new Error("Company profile schema mismatch: expected an ordinary table");
  const columns = await db("information_schema.columns").select("column_name", "data_type", "is_nullable", "character_maximum_length", "column_default")
    .where({ table_schema: "b2b", table_name: "organization_profiles" });
  const expected = {
    organization_id: ["uuid", "NO", null],
    ...Object.fromEntries(CONTACT_FIELDS.map((field) => [field, ["character varying", "YES", LIMITS[field]]])),
    version: ["integer", "NO", null],
    updated_at: ["timestamp with time zone", "NO", null],
  };
  if (columns.length !== Object.keys(expected).length || columns.some((column) => {
    const shape = expected[column.column_name];
    return !shape || column.data_type !== shape[0] || column.is_nullable !== shape[1] || column.character_maximum_length !== shape[2] || column.column_default !== null;
  })) throw new Error("Company profile schema mismatch: columns require reviewed migration");
  const constraints = (await db.raw("SELECT conname, contype, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='b2b.organization_profiles'::regclass")).rows;
  const has = (type, definition) => constraints.some((constraint) => constraint.contype === type && constraint.definition === definition);
  if (constraints.length !== 3 || !has("p", "PRIMARY KEY (organization_id)") ||
      !has("f", "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id) ON DELETE CASCADE") ||
      !has("c", "CHECK ((version > 0))"))
    throw new Error("Company profile schema mismatch: constraints require reviewed migration");
  // An unreviewed unique index can reject otherwise valid optional values even
  // without appearing in pg_constraint (for example a standalone email index).
  const uniqueIndexes = (await db.raw("SELECT i.indisprimary FROM pg_index i WHERE i.indrelid='b2b.organization_profiles'::regclass AND i.indisunique")).rows;
  if (uniqueIndexes.length !== 1 || !uniqueIndexes[0].indisprimary)
    throw new Error("Company profile schema mismatch: unique indexes require reviewed migration");
}

async function ensureSchema(db) {
  await db.transaction(async (tx) => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624110)");
    if (!(await tx.schema.withSchema("b2b").hasTable("organization_profiles"))) {
      await tx.schema.withSchema("b2b").createTable("organization_profiles", (t) => {
        t.uuid("organization_id").primary().references("id").inTable("b2b.organizations").onDelete("CASCADE");
        for (const field of CONTACT_FIELDS) t.string(field, LIMITS[field]);
        t.integer("version").notNullable();
        t.timestamp("updated_at", { useTz: true }).notNullable();
        t.check("version > 0", [], "organization_profiles_positive_version");
      });
    }
    await verifySchema(tx);
  });
}

function snapshot(organization, profile) {
  return {
    organization_id: organization.id,
    name: organization.name,
    ...Object.fromEntries(CONTACT_FIELDS.map((field) => [field, profile?.[field] ?? null])),
    version: profile?.version ?? 0,
    updated_at: profile?.updated_at ?? organization.updated_at,
  };
}

function createOrganizationProfile({ db, auth, audit }) {
  async function get(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ);
    strictObject(ctx.query || {}, [], "Query");
    ctx.body = await db.transaction(async (tx) => {
      const fresh = await assertActiveContext(tx, context, READ);
      return snapshot(fresh.organization, await table(tx, "organization_profiles").where({ organization_id: fresh.organization_id }).first());
    });
  }

  async function update(ctx) {
    privateResponse(ctx);
    const context = await auth.permission(ctx, READ);
    if (!context.permissions.has(UPDATE)) throw new AppError("permission_denied", `Permission '${UPDATE}' is required`, 403);
    strictObject(ctx.query || {}, [], "Query");
    const patch = validatePatch(ctx.request.body);
    ctx.body = await db.transaction(async (tx) => {
      // Match all existing domain writes: user SHARE → membership SHARE →
      // organization UPDATE → role SHARE. First writes also serialize here.
      const fresh = await assertActiveContext(tx, context, [READ, UPDATE], { lockOrganizationForUpdate: true });
      const organization_id = fresh.organization_id;
      const current = await table(tx, "organization_profiles").where({ organization_id }).first();
      const before = snapshot(fresh.organization, current);
      // A stale request conflicts even when its values happen to match.
      if (patch.version !== before.version) throw new AppError("version_conflict", "Company profile changed. Review the latest saved version before trying again.", 409);
      if (Object.entries(patch.fields).every(([field, value]) => before[field] === value)) return before;
      if (before.version === MAX_VERSION) throw new AppError("version_conflict", "Company profile version limit reached; administrator review required", 409);
      const timestamp = new Date();
      const after = { ...before, ...patch.fields, version: before.version + 1, updated_at: timestamp };
      const record = {
        organization_id,
        ...Object.fromEntries(CONTACT_FIELDS.map((field) => [field, after[field]])),
        version: after.version,
        updated_at: timestamp,
      };
      if (current) await table(tx, "organization_profiles").where({ organization_id }).update(record);
      else await table(tx, "organization_profiles").insert(record);
      await table(tx, "organizations").where({ id: organization_id }).update({ name: after.name, updated_at: timestamp });
      await audit(tx, ctx, {
        action: "organization.profile.update", actor_user_id: fresh.user.id,
        organization_id, entity_type: "organization_profile", entity_id: organization_id,
        event_metadata: { before, after },
      });
      return after;
    });
  }
  return { get, update };
}

module.exports = { READ, UPDATE, LIMITS, MAX_VERSION, validatePatch, verifySchema, ensureSchema, snapshot, createOrganizationProfile };
