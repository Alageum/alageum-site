"use strict";
// Acceptance evidence for an owned disposable database. Never runtime code.
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { TABLE: RATE_LIMIT_TABLE } = require("../src/domain/distributed-rate-limit");
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const REQUIRED = Object.freeze({
  b2b: ["users", "organizations", "roles", "memberships", "audit_events", "refresh_sessions", "browser_sessions", "external_identities", "federated_browsers", "federated_attempts", "registration_profiles", "account_tokens", "registration_rate_buckets", "registration_mail_outbox", "company_access_requests", RATE_LIMIT_TABLE, "orders", "order_items", "invoices", "quote_requests", "quote_request_items", "documents", "document_versions", "file_objects", "tickets", "ticket_messages"],
  public: ["admin_users", "admin_roles", "admin_permissions", "alageum_products", "alageum_categories", "alageum_pages"],
});
const qualified = rows => rows.map(row => `${row.table_schema}.${row.table_name}`).sort();

function assertReadOnlyFingerprint(value, schemas = ["b2b", "public"]) {
  assert.equal(value.format, "alageum-whole-schema-read-only-v1");
  assert.deepEqual(value.schemas, [...schemas].sort());
  assert.ok(value.schemas.every(schema => Object.hasOwn(REQUIRED, schema)));
  assert.ok(Array.isArray(value.tableNames));
  assert.deepEqual(value.tableNames, [...new Set(value.tableNames)].sort(), "Every qualified table must occur once");
  assert.equal(value.tables, value.tableNames.length, "Count is derived from the actual table inventory");
  for (const name of value.tableNames) {
    assert.match(name, /^(?:b2b|public)\.[a-z][a-z0-9_]*$/);
    assert.ok(value.schemas.includes(name.split(".")[0]), "No unrequested schema may be fingerprinted");
  }
  for (const schema of value.schemas)
    for (const name of REQUIRED[schema]) assert.ok(value.tableNames.includes(`${schema}.${name}`), `Required ${schema}.${name} was omitted`);
  assert.equal(value.inventoryDigest, hash(value.tableNames));
  assert.match(value.digest, /^[a-f0-9]{64}$/);
  return value;
}

function createReadOnlyFingerprint({ schemas, tables, catalogTables, rows, columns, constraints }) {
  const tableNames = qualified(tables);
  assert.deepEqual(qualified(catalogTables), tableNames, "information_schema must cover every pg_catalog base table");
  assert.deepEqual(Object.keys(rows).sort(), tableNames, "Every discovered table must have its complete rows fingerprinted");
  assert.deepEqual([...new Set(qualified(columns))], tableNames, "Every discovered table must have column metadata fingerprinted");
  const inventory = { format: "alageum-whole-schema-read-only-v1", schemas: [...schemas].sort(), tables: tableNames.length, tableNames, inventoryDigest: hash(tableNames) };
  return assertReadOnlyFingerprint({ ...inventory, digest: hash({ inventory, rows, columns, constraints }) }, schemas);
}
module.exports = { REQUIRED, assertReadOnlyFingerprint, createReadOnlyFingerprint };
