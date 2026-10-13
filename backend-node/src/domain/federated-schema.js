"use strict";
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624119)");
    const schema = () => tx.schema.withSchema("b2b");
    if (!(await schema().hasTable("external_identities"))) await schema().createTable("external_identities", t => {
      t.uuid("id").primary();
      t.string("provider", 40).notNullable();
      t.string("subject", 255).notNullable();
      t.uuid("user_id").notNullable().references("id").inTable("b2b.users").onDelete("CASCADE");
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
      t.unique(["provider", "subject"]);
      t.unique(["provider", "user_id"]);
    });
    if (!(await schema().hasTable("federated_browsers"))) await schema().createTable("federated_browsers", t => {
      t.string("browser_hash", 64).primary();
      t.string("state_hash", 64);
      t.uuid("flow_id").notNullable();
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
    });
    if (!(await schema().hasTable("federated_attempts"))) await schema().createTable("federated_attempts", t => {
      t.string("state_hash", 64).primary();
      t.string("browser_hash", 64).notNullable();
      t.string("nonce", 64).notNullable();
      t.string("verifier", 128).notNullable();
      t.string("return_path", 240).notNullable();
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
    });
    if (!(await schema().hasTable("browser_sessions"))) await schema().createTable("browser_sessions", t => {
      t.uuid("id").primary();
      t.string("token_hash", 64).notNullable().unique();
      t.string("browser_hash", 64).notNullable().unique();
      t.uuid("user_id").notNullable().references("id").inTable("b2b.users").onDelete("CASCADE");
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
    });
  });
}
module.exports = { ensureSchema };
