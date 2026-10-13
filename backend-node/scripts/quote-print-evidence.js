"use strict";
const { cpSync, mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

// All generated artifacts stay outside the always-upload directory until a full
// sanitizer pass succeeds. Both directories belong to this disposable run.
function publishVerifiedEvidence({ staging, published, sanitize, report, redact, reportName = "quote-print-results.json" }) {
  if (!["quote-print-results.json", "results.json"].includes(reportName)) throw new Error("Unsupported evidence summary filename");
  let verified = false;
  try {
    sanitize(staging);
    cpSync(staging, published, { recursive: true });
    verified = true;
  } catch {
    report.status = "failed";
    report.cleanup = "failed";
    report.evidence = "withheld: artifact sanitization or publication failed";
    // A failed copy can contain only already-validated files, but retain just a
    // minimal report for a clear, fail-closed publication contract.
    rmSync(published, { recursive: true, force: true });
    mkdirSync(published, { recursive: true, mode: 0o700 });
  }
  writeFileSync(join(published, reportName), `${redact(JSON.stringify(report, null, 2))}\n`, { mode: 0o600 });
  return verified;
}
module.exports = { publishVerifiedEvidence };
