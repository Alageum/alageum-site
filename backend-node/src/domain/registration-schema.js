"use strict";

async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624127)");
    const schema = () => tx.schema.withSchema("b2b");
    for (const name of ["users", "browser_sessions", "refresh_sessions"]) {
      if (!(await schema().hasColumn(name, "credential_version")))
        await schema().alterTable(name, t => t.integer("credential_version").notNullable().defaultTo(0));
    }
    // Fail closed on pre-existing ambiguous email identities. Never merge accounts.
    await tx.raw("CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique ON b2b.users (lower(trim(email)))");
    if (!(await schema().hasTable("registration_profiles"))) await schema().createTable("registration_profiles", t => {
      t.uuid("user_id").primary().references("id").inTable("b2b.users").onDelete("CASCADE");
      t.timestamp("verified_at", { useTz: true });
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
    });
    if (!(await schema().hasTable("account_tokens"))) await schema().createTable("account_tokens", t => {
      t.uuid("id").primary();
      t.uuid("user_id").notNullable().references("id").inTable("b2b.users").onDelete("CASCADE");
      t.string("purpose", 20).notNullable();
      t.string("token_hash", 64).notNullable().unique();
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
      t.timestamp("consumed_at", { useTz: true });
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
    });
    await tx.raw("CREATE UNIQUE INDEX IF NOT EXISTS account_tokens_live_unique ON b2b.account_tokens (user_id, purpose) WHERE consumed_at IS NULL");
    if (!(await schema().hasTable("registration_rate_buckets"))) await schema().createTable("registration_rate_buckets", t => {
      t.string("key_hash", 64).primary();
      t.integer("attempts").notNullable();
      t.timestamp("expires_at", { useTz: true }).notNullable().index();
    });
    if (!(await schema().hasTable("registration_mail_outbox"))) await schema().createTable("registration_mail_outbox", t => {
      t.uuid("id").primary();
      t.uuid("token_id").notNullable().references("id").inTable("b2b.account_tokens").onDelete("CASCADE");
      t.text("payload").notNullable();
      t.integer("attempts").notNullable().defaultTo(0);
      t.timestamp("available_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
      t.timestamp("locked_until", { useTz: true });
      t.timestamp("expires_at", { useTz: true }).notNullable();
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
    });
    // Additive migration for existing queues. Ownership fencing prevents an old
    // worker from acknowledging a row reclaimed after its lease expired.
    if (!(await schema().hasColumn("registration_mail_outbox", "lease_id")))
      await schema().alterTable("registration_mail_outbox", t => t.uuid("lease_id"));
    if (!(await schema().hasTable("company_access_requests"))) await schema().createTable("company_access_requests", t => {
      t.uuid("id").primary();
      t.uuid("user_id").notNullable().references("id").inTable("b2b.users").onDelete("CASCADE");
      // Identifier matching only routes a request. No membership is created here.
      t.uuid("organization_id").references("id").inTable("b2b.organizations").onDelete("SET NULL");
      t.string("company_name", 240).notNullable();
      t.string("company_identifier", 200).notNullable();
      t.text("message").notNullable().defaultTo("");
      t.string("status", 20).notNullable().defaultTo("pending");
      t.uuid("decided_by").references("id").inTable("b2b.users");
      t.timestamp("decided_at", { useTz: true });
      t.text("decision_reason");
      t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(tx.fn.now());
      t.index(["organization_id", "status"]);
      t.index(["user_id", "created_at"]);
    });
    await tx.raw("CREATE UNIQUE INDEX IF NOT EXISTS company_access_requests_pending_unique ON b2b.company_access_requests (user_id, company_identifier) WHERE status = 'pending'");
  });
}
module.exports = { ensureSchema };
