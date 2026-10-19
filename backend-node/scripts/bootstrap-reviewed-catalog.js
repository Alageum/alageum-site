"use strict";
// Explicit operator bootstrap only. Default is source validation, without DB IO.
const { assertProductionStartup } = require("../src/domain/production-readiness");
const { readCatalog } = require("../src/domain/catalog-source");
function options(args) {
  if (!Array.isArray(args) || args.length > 1 || (args.length === 1 && args[0] !== "--apply"))
    throw new Error("Use no arguments for source validation, or explicit --apply for an empty catalog");
  return { apply: args.length === 1 };
}
async function bootstrap({ args = [], env = process.env, read = readCatalog, createApp } = {}) {
  const selected = options(args);
  if (env.APP_ENV !== "production") throw new Error("Reviewed server bootstrap requires APP_ENV=production");
  assertProductionStartup((name, fallback) => env[name] ?? fallback);
  const records = read(); // Enforces the shipped source release/identity hashes.
  const summary = { source_records: records.length, source_categories: new Set(records.map(record => record.category)).size,
    applied: false, database_checked: false, requires_empty_catalog: true };
  if (!selected.apply) return summary;
  const app = (createApp || (() => require("@strapi/strapi").createStrapi({ appDir: process.cwd(), distDir: process.cwd() })))();
  try {
    await app.load(); // Native schema/storage/version checks finish before import.
    const imported = await app.alageum.catalog.importRecords(records, { requireEmpty: true });
    return { ...summary, ...imported, applied: true, database_checked: true };
  } finally { await app.destroy(); }
}
if (require.main === module) bootstrap({ args: process.argv.slice(2) }).then(result => console.log(JSON.stringify(result, null, 2))).catch(() => {
  console.error("Reviewed catalog bootstrap refused or failed. Check validated configuration, storage, database version and an empty catalog; existing data was not overwritten."); process.exitCode = 1;
});
module.exports = { options, bootstrap };
