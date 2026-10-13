"use strict";
const { randomUUID } = require("node:crypto");
async function ensureSchema(db) {
  await db.raw("CREATE SCHEMA IF NOT EXISTS b2b");
  if (!(await db.schema.withSchema("b2b").hasTable("audit_events")))
    await db.schema.withSchema("b2b").createTable("audit_events", (t) => {
      t.uuid("id").primary();
      t.string("action", 100).notNullable();
      t.uuid("actor_user_id");
      t.uuid("organization_id");
      t.string("entity_type", 100);
      t.string("entity_id", 240);
      t.jsonb("event_metadata").notNullable().defaultTo("{}");
      t.string("request_id", 100);
      t.timestamp("created_at", { useTz: true })
        .notNullable()
        .defaultTo(db.fn.now());
    });
}
async function audit(tx, ctx, event) {
  const allowed = {
    id: randomUUID(),
    action: event.action,
    actor_user_id: event.actor_user_id || null,
    organization_id: event.organization_id || null,
    entity_type: event.entity_type || null,
    entity_id: event.entity_id || null,
    event_metadata: event.event_metadata || {},
    request_id: ctx?.state?.requestId || null,
  };
  await tx.withSchema("b2b").table("audit_events").insert(allowed);
}
module.exports = { ensureSchema, audit };
