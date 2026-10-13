"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { digest, sourceDigest } = require("./catalog-media-evidence");

function readIdentityCompletion(directory, baseline, release) {
  const entry = release.sources?.identityCompletion;
  if (!entry) return baseline;
  const bytes = fs.readFileSync(path.join(directory, "manifest.json"));
  if (digest(bytes) !== entry.manifestSha256) throw new Error("Identity completion manifest checksum mismatch");
  const manifest = JSON.parse(bytes);
  if (manifest.format !== "alageum-identity-completion-v1" || manifest.approvalSha256 !== entry.approvalSha256 ||
      manifest.recordsSha256 !== entry.recordsSha256 || manifest.sourceId !== entry.sourceId ||
      manifest.counts.baselineRecordCount !== baseline.length || manifest.counts.executionAdmissions !== entry.recordCount ||
      manifest.counts.resultRecordCount !== release.recordCount || manifest.counts.newFamilyCards !== 0 ||
      sourceDigest(baseline) !== manifest.baselineRecordsSha256) throw new Error("Identity completion review binding mismatch");
  const records = [];
  for (const chunk of manifest.recordChunks) {
    if (!/^records-\d{3}\.json$/.test(chunk.path)) throw new Error("Unsafe identity completion path");
    const content = fs.readFileSync(path.join(directory, chunk.path));
    if (digest(content) !== chunk.sha256 || content.length !== chunk.bytes) throw new Error("Identity completion checksum mismatch");
    const rows = JSON.parse(content);
    if (!Array.isArray(rows) || rows.length !== chunk.recordCount) throw new Error("Identity completion chunk count mismatch");
    records.push(...rows);
  }
  if (records.length !== entry.recordCount || sourceDigest(records) !== manifest.recordsSha256) throw new Error("Identity completion records mismatch");
  const ids = new Set(baseline.map(row => row.id));
  const admissions = new Map(manifest.actions.filter(action => action.mode === "execution").map(action => [action.sourceRecordId, action]));
  for (const row of records) {
    const admission = admissions.get(row.id);
    if (ids.has(row.id) || !admission || admission.canonicalId !== row.id || !ids.has(row.familyId) ||
        row.sourceId !== manifest.sourceId || row.sourceFileId !== manifest.sourceFileId || row.sourceSha256 !== manifest.sourceSha256 ||
        row.sku !== null || row.isOrderableSku !== false || !row.execution || row.recordKind !== "variant") throw new Error("Identity completion identity conflict");
    ids.add(row.id);
  }
  return [...baseline, ...records];
}
module.exports = { readIdentityCompletion };
