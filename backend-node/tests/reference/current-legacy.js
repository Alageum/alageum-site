"use strict";
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { resolve } = require("node:path");
const root = resolve(__dirname, "../../..");
const reference = "backend-node/tests/reference/";
const archived = Object.freeze({
  system: { fixture: "legacy-system.json", fixture_sha256: "02cc5f028c91edb5cfcba01431eaac98edf5ef4aac85dae02c24bfbed960c648", generator: "generate_legacy_system.py", generator_sha256: "47aedc106c4504a8615f753a7f0b2246f9ca8f8573a2b3fb1c3443c8d8d30ff7", source_revision: "74b92855d1dcc2997c471823f83686ac66972649" },
  query: { fixture: "legacy-query.json", fixture_sha256: "c65df50f34280e913453c73f54833a83f63b5a91bbd3fb413cc4b676a2600ea6", generator: "generate_legacy_query.py", generator_sha256: "327d025dfc0f6681f50fabd2816b8774b305e87dde13d50734d9563bc0ad59ad", source_revision: "2c762db62fd779595a3d78e336f7911f10953783" },
  quote_limit: { fixture: "legacy-quote-limit.json", fixture_sha256: "3614623cdead5186dae9a62e4fd018e01c7d7417f691831c60f05c8e440e0264", generator: "generate_legacy_quote_limit.py", generator_sha256: "40ddad60745cc62b264deb917d4725b45fee722b438a855a889f1e85bf536f14", source_revision: "8def4eb6b95588d11313f5df19f67bd80d1564a0" },
});
const hash = value => createHash("sha256").update(value).digest("hex");

function verifyCurrentLegacyReference(name, fixture, read = file => readFileSync(resolve(root, file))) {
  assert.ok(Object.hasOwn(archived, name));
  const manifest = JSON.parse(read(reference + "current-legacy-reference.json"));
  assert.equal(manifest.format, "alageum-current-legacy-reference-v2");
  assert.equal(manifest.source_revision, "4b723b73515d0b2b4016541892ce69167ecafd7f");
  assert.match(manifest.evidence, /not a historical approval/);
  assert.deepEqual(manifest.archives[name], archived[name], "Historical archive identity must not be relabeled");
  for (const field of ["fixture", "generator"])
    assert.equal(hash(read(reference + archived[name][field])), archived[name][field + "_sha256"], `Historical ${field} changed`);
  assert.equal(fixture.source_revision, archived[name].source_revision);
  assert.equal(manifest.provenance.transfer_revision, "53f4ec681babcdd0f468059cdb93cfcfde294fa3");
  assert.equal(manifest.provenance.transfer_history_included, false);
  if (Object.hasOwn(fixture.source_sha256, "backend/app/core/config.py")) assert.equal(manifest.provenance.historical_sha256, fixture.source_sha256["backend/app/core/config.py"]);
  assert.equal(manifest.provenance.current_sha256, manifest.source_sha256["backend/app/core/config.py"]);
  assert.deepEqual(manifest.prior_evidence, { manifest: "current-legacy-reference.pre-certifi-20261019.json", sha256: "14cc5a4788a83b8426f5afc6a55855e0ece8b77f6d9f31a5dac2cf9ac8cfac13", source_revision: "588dc98e7f0ded7a31b8fdee21c724f8889dfbb7" });
  assert.equal(hash(read(reference + manifest.prior_evidence.manifest)), manifest.prior_evidence.sha256, "Previous execution evidence changed");
  const update = manifest.dependency_update;
  assert.equal(update.file, "backend/uv.lock");
  assert.equal(update.historical_sha256, "80d93e2751be39e87ef0480761caa00369657f022bab5db4c51edeae36e7935e");
  assert.equal(update.current_sha256, "06e080b4fa6191dcfea7e9f2189205c9cec4dc67cd66ec8fee654314ac2f1362");
  assert.equal(manifest.source_sha256[update.file], update.current_sha256);
  assert.equal(update.package, "certifi"); assert.equal(update.previous_version, "2026.7.22"); assert.equal(update.current_version, "2026.10.19");
  assert.equal(update.previous_lock_revision, 3); assert.equal(update.current_lock_revision, 5);
  const changed = [];
  for (const [file, historical] of Object.entries(fixture.source_sha256)) {
    const current = manifest.source_sha256[file];
    assert.match(current || "", /^[a-f0-9]{64}$/);
    assert.equal(hash(read(file)), current, `Current reference source drift: ${file}`);
    if (current !== historical) changed.push(file);
  }
  assert.deepEqual(changed, { query: ["backend/app/core/config.py", "backend/uv.lock"], quote_limit: ["backend/app/core/config.py"], system: ["backend/uv.lock"] }[name], "Only documented sanitization/security-lock changes differ");
  const proof = manifest.execution[name];
  const groups = ["dto_cases", "timestamp_cases", "metric_steps", "rounding_cases", "integer_cases"];
  assert.equal(proof.cases, name === "system" ? groups.reduce((sum, key) => sum + fixture[key].length, 0) : fixture.cases.length);
  if (name === "system") assert.deepEqual(proof.case_groups, Object.fromEntries(groups.map(key => [key, fixture[key].length])));
  assert.equal(proof.client_key_cases, (fixture.client_key_cases || []).length);
  assert.equal(proof.all_archived_outputs_equal, true);
  assert.match(proof.behavior_sha256, /^[a-f0-9]{64}$/);
  return manifest;
}
module.exports = { verifyCurrentLegacyReference };
