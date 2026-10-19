"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../../..");
const reference = "backend-node/tests/reference/";
const archived = Object.freeze({
  query: { fixture: "legacy-query.json", fixture_sha256: "c65df50f34280e913453c73f54833a83f63b5a91bbd3fb413cc4b676a2600ea6", generator: "generate_legacy_query.py", generator_sha256: "327d025dfc0f6681f50fabd2816b8774b305e87dde13d50734d9563bc0ad59ad", source_revision: "2c762db62fd779595a3d78e336f7911f10953783" },
  quote_limit: { fixture: "legacy-quote-limit.json", fixture_sha256: "3614623cdead5186dae9a62e4fd018e01c7d7417f691831c60f05c8e440e0264", generator: "generate_legacy_quote_limit.py", generator_sha256: "40ddad60745cc62b264deb917d4725b45fee722b438a855a889f1e85bf536f14", source_revision: "8def4eb6b95588d11313f5df19f67bd80d1564a0" },
});
const hash = value => createHash("sha256").update(value).digest("hex");

function verifyCurrentLegacyReference(name, fixture, read = file => readFileSync(resolve(root, file))) {
  assert.ok(Object.hasOwn(archived, name));
  const manifest = JSON.parse(read(reference + "current-legacy-reference.json"));
  assert.equal(manifest.format, "alageum-current-legacy-reference-v1");
  assert.equal(manifest.source_revision, "588dc98e7f0ded7a31b8fdee21c724f8889dfbb7");
  assert.match(manifest.evidence, /not a historical approval/);
  assert.deepEqual(manifest.archives[name], archived[name], "Historical archive identity must not be relabeled");
  for (const field of ["fixture", "generator"])
    assert.equal(hash(read(reference + archived[name][field])), archived[name][field + "_sha256"], `Historical ${field} changed`);
  assert.equal(fixture.source_revision, archived[name].source_revision);
  assert.equal(manifest.provenance.transfer_revision, "53f4ec681babcdd0f468059cdb93cfcfde294fa3");
  assert.equal(manifest.provenance.transfer_history_included, false);
  assert.equal(manifest.provenance.historical_sha256, fixture.source_sha256["backend/app/core/config.py"]);
  assert.equal(manifest.provenance.current_sha256, manifest.source_sha256["backend/app/core/config.py"]);
  const changed = [];
  for (const [file, historical] of Object.entries(fixture.source_sha256)) {
    const current = manifest.source_sha256[file];
    assert.match(current || "", /^[a-f0-9]{64}$/);
    assert.equal(hash(read(file)), current, `Current reference source drift: ${file}`);
    if (current !== historical) changed.push(file);
  }
  assert.deepEqual(changed, ["backend/app/core/config.py"], "Only documented transfer sanitization differs");
  const proof = manifest.execution[name];
  assert.equal(proof.cases, fixture.cases.length);
  assert.equal(proof.client_key_cases, (fixture.client_key_cases || []).length);
  assert.equal(proof.all_archived_outputs_equal, true);
  assert.match(proof.behavior_sha256, /^[a-f0-9]{64}$/);
  return manifest;
}
module.exports = { verifyCurrentLegacyReference };
