#!/usr/bin/env node
"use strict";
// Read only already-injected environment. Do not load arbitrary env files,
// connect to services, print values, create credentials or initialize Strapi.
const { inspectProductionConfiguration } = require("../src/domain/production-readiness");
const { readMediaConfig } = require("../src/domain/media-policy");
const { inspectMediaStorage } = require("../src/domain/media-storage");
async function main() {
  const report = inspectProductionConfiguration();
  try {
    const media = readMediaConfig();
    report.media_storage = await inspectMediaStorage({ publicRoot: media.storage.publicRoot, quarantineRoot: media.quarantineRoot });
  } catch {
    report.media_storage = { configured: false, directories_ready: false, issues: ["invalid_media_configuration"], volume_persistence_verified: false, backup_restore_verified: false };
  }
  report.local_startup_checks_passed = report.configuration_valid && report.media_storage.directories_ready;
  // Exit zero certifies only these local checks, not live services or release
  // evidence. Strapi still verifies its database/schema before accepting HTTP.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.local_startup_checks_passed ? 0 : 1;
}
main().catch(() => { process.stderr.write("Production configuration inspection failed\n"); process.exitCode = 1; });
