"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { publishVerifiedEvidence } = require("../scripts/quote-print-evidence");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "quote-print-evidence-test-"));
  const staging = join(root, "private-artifacts"), published = join(root, "evidence");
  mkdirSync(staging); mkdirSync(published);
  return { root, staging, published, redact: value => value.replaceAll("fixture-secret", "[REDACTED]") };
}
test("sanitizer failure leaves only a redacted failure summary in the upload path", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.staging, "browser-results.json"), '{"secret":"fixture-secret"}');
    writeFileSync(join(f.staging, "unverified.zip"), "unvetted data");
    const report = { status: "passed", detail: "fixture-secret" };
    assert.equal(publishVerifiedEvidence({ ...f, report, sanitize: () => { throw new Error("unknown binary"); } }), false);
    assert.deepEqual(readdirSync(f.published), ["quote-print-results.json"]);
    const summary = readFileSync(join(f.published, "quote-print-results.json"), "utf8");
    assert.equal(JSON.parse(summary).status, "failed");
    assert.match(summary, /withheld/); assert.doesNotMatch(summary, /fixture-secret/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
test("artifact copying happens only after full validation, including a cleanup-failure report", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.staging, "browser-results.json"), '{"secret":"fixture-secret"}');
    const report = { status: "failed", cleanup: "failed" };
    const sanitize = directory => {
      assert.deepEqual(readdirSync(f.published), []);
      const file = join(directory, "browser-results.json");
      writeFileSync(file, f.redact(readFileSync(file, "utf8")));
    };
    assert.equal(publishVerifiedEvidence({ ...f, report, sanitize }), true);
    assert.doesNotMatch(readFileSync(join(f.published, "browser-results.json"), "utf8"), /fixture-secret/);
    assert.equal(JSON.parse(readFileSync(join(f.published, "quote-print-results.json"), "utf8")).cleanup, "failed");
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("support summary uses its own allowlisted name and remains fail-closed", () => {
  const f = fixture();
  try {
    writeFileSync(join(f.staging, "browser-results.json"), '{"secret":"fixture-secret"}');
    assert.equal(publishVerifiedEvidence({ ...f, reportName: "results.json", report: { status: "passed" }, sanitize: () => { throw new Error("Fictitious sanitizer failure"); } }), false);
    assert.deepEqual(readdirSync(f.published), ["results.json"]);
    assert.equal(JSON.parse(readFileSync(join(f.published, "results.json"), "utf8")).status, "failed");
    assert.throws(() => publishVerifiedEvidence({ ...f, reportName: "../outside.json" }), /Unsupported evidence summary/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test("support publishes a sanitized success under results.json without a print summary", () => {
  const f = fixture();
  try {
    const source = join(f.staging, "browser-results.json");
    writeFileSync(source, '{"secret":"fixture-secret"}');
    assert.equal(publishVerifiedEvidence({ ...f, reportName: "results.json", report: { status: "passed", browserTests: 20 }, sanitize: () => writeFileSync(source, f.redact(readFileSync(source, "utf8"))) }), true);
    assert.deepEqual(readdirSync(f.published).sort(), ["browser-results.json", "results.json"]);
    assert.deepEqual(JSON.parse(readFileSync(join(f.published, "results.json"), "utf8")), { status: "passed", browserTests: 20 });
    assert.doesNotMatch(readFileSync(join(f.published, "browser-results.json"), "utf8"), /fixture-secret/);
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
