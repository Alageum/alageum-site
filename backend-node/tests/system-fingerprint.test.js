"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { REQUIRED, assertReadOnlyFingerprint, createReadOnlyFingerprint } = require("./system-fingerprint");
function input(extra = []) {
  const tables = [...Object.entries(REQUIRED).flatMap(([table_schema, names]) => names.map(table_name => ({ table_schema, table_name }))), ...extra];
  return { schemas: ["b2b", "public"], tables, catalogTables: structuredClone(tables), rows: Object.fromEntries(tables.map(t => [`${t.table_schema}.${t.table_name}`, "[]"])), columns: tables.map(t => ({ ...t, column_name: "id", data_type: "uuid" })), constraints: [] };
}
test("fingerprint covers semantic domains and accepts additional fully fingerprinted migration tables", () => {
  const data = input([{ table_schema: "b2b", table_name: "future_migration_table" }]);
  const proof = createReadOnlyFingerprint(data); assertReadOnlyFingerprint(proof);
  assert.equal(proof.tables, data.tables.length);
  assert.ok(proof.tableNames.includes("b2b.future_migration_table"));
});
test("omitted identity/session/rate/audit/domain/CMS tables fail even with a self-consistent count", () => {
  for (const [schema, names] of Object.entries(REQUIRED)) for (const name of names) {
    const data = input(); const key = `${schema}.${name}`;
    for (const field of ["tables", "catalogTables", "columns"]) data[field] = data[field].filter(t => `${t.table_schema}.${t.table_name}` !== key);
    delete data.rows[key]; assert.throws(() => createReadOnlyFingerprint(data), /Required/);
  }
});
test("independent catalog inventory detects undiscovered tables and incomplete row/column coverage", () => {
  for (const mutate of [d => d.catalogTables.pop(), d => delete d.rows[Object.keys(d.rows)[0]], d => d.columns.pop()]) {
    const data = input(); mutate(data); assert.throws(() => createReadOnlyFingerprint(data));
  }
});
test("row, column and constraint changes alter the whole-schema digest", () => {
  const baseline = createReadOnlyFingerprint(input());
  for (const mutate of [d => d.rows["b2b.users"] = '[{"id":"changed"}]', d => d.columns[0].data_type = "text", d => d.constraints.push({ definition: "changed" })]) {
    const data = input(); mutate(data); assert.notEqual(createReadOnlyFingerprint(data).digest, baseline.digest);
  }
});
test("acceptance rejects fabricated counts, duplicate names, foreign schemas and corrupted digests", () => {
  for (const mutate of [p => p.tables++, p => p.tableNames.push(p.tableNames[0]), p => p.schemas.push("private"), p => p.inventoryDigest = "0".repeat(64), p => p.digest = "missing"])
    { const proof = createReadOnlyFingerprint(input()); mutate(proof); assert.throws(() => assertReadOnlyFingerprint(proof)); }
});
