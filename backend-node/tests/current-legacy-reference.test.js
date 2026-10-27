"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { resolve } = require("node:path");
const { verifyCurrentLegacyReference } = require("./reference/current-legacy");
const root = resolve(__dirname, "../..");
const read = file => readFileSync(resolve(root, file));
const fixture = require("./reference/legacy-query.json");
const manifestPath = "backend-node/tests/reference/current-legacy-reference.json";
const mutateManifest = mutate => file => {
  if (file !== manifestPath) return read(file);
  const value = JSON.parse(read(file)); mutate(value); return JSON.stringify(value);
};
test("current evidence keeps historical fixtures and every current source pinned", () => {
  verifyCurrentLegacyReference("query", fixture);
  verifyCurrentLegacyReference("quote_limit", require("./reference/legacy-quote-limit.json"));
  verifyCurrentLegacyReference("system", require("./reference/legacy-system.json"));
});
test("historical archive changes and current source drift fail closed", () => {
  for (const changed of ["backend-node/tests/reference/legacy-query.json", "backend-node/tests/reference/generate_legacy_query.py", "backend/app/core/config.py", "backend/app/core/pagination.py", "backend/uv.lock", "backend-node/tests/reference/current-legacy-reference.pre-certifi-20261019.json"])
    assert.throws(() => verifyCurrentLegacyReference("query", fixture, file => file === changed ? Buffer.concat([read(file), Buffer.from("\n")]) : read(file)));
});
test("provenance and complete vector counts cannot be replaced with an approval claim", () => {
  for (const mutate of [m => m.evidence = "historically approved", m => m.archives.query.source_revision = "0".repeat(40), m => m.execution.query.cases--, m => m.execution.query.all_archived_outputs_equal = false, m => m.provenance.historical_sha256 = m.provenance.current_sha256])
    assert.throws(() => verifyCurrentLegacyReference("query", fixture, mutateManifest(mutate)));
});

test("current certifi remediation cannot relabel archives or loosen exact source pins", () => {
  for (const mutate of [m => m.dependency_update.current_version = "latest", m => m.dependency_update.previous_version = "2026.10.19", m => m.dependency_update.current_sha256 = "0".repeat(64), m => m.dependency_update.current_lock_revision = 3, m => m.prior_evidence.source_revision = m.source_revision])
    assert.throws(() => verifyCurrentLegacyReference("query", fixture, mutateManifest(mutate)));
  const system = require("./reference/legacy-system.json");
  for (const changed of ["backend-node/tests/reference/legacy-system.json", "backend-node/tests/reference/generate_legacy_system.py"])
    assert.throws(() => verifyCurrentLegacyReference("system", system, file => file === changed ? Buffer.concat([read(file), Buffer.from("\n")]) : read(file)));
  assert.throws(() => verifyCurrentLegacyReference("system", system, mutateManifest(m => m.execution.system.case_groups.integer_cases--)));
});
