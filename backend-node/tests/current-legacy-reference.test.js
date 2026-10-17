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
});
test("historical archive changes and current source drift fail closed", () => {
  for (const changed of ["backend-node/tests/reference/legacy-query.json", "backend-node/tests/reference/generate_legacy_query.py", "backend/app/core/config.py", "backend/app/core/pagination.py"])
    assert.throws(() => verifyCurrentLegacyReference("query", fixture, file => file === changed ? Buffer.concat([read(file), Buffer.from("\n")]) : read(file)));
});
test("provenance and complete vector counts cannot be replaced with an approval claim", () => {
  for (const mutate of [m => m.evidence = "historically approved", m => m.archives.query.source_revision = "0".repeat(40), m => m.execution.query.cases--, m => m.execution.query.all_archived_outputs_equal = false, m => m.provenance.historical_sha256 = m.provenance.current_sha256])
    assert.throws(() => verifyCurrentLegacyReference("query", fixture, mutateManifest(mutate)));
});
