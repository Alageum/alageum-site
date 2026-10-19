#!/usr/bin/env node
"use strict";
const { spawn, spawnSync } = require("node:child_process");
process.umask(0o022);
if (process.env.APP_ENV === "production") {
  const check = spawnSync(process.execPath, ["scripts/check-production-readiness.js"], { stdio: "inherit" });
  if (check.error || check.status !== 0) process.exit(1);
}
for (const script of ["strapi-webpack-patch.js", "check-media-package.js", "check-page-editor-adapter.js"]) {
  const args = script === "strapi-webpack-patch.js" ? ["--check"] : [];
  const check = spawnSync(process.execPath, [`scripts/${script}`, ...args], { stdio: "inherit" });
  if (check.error || check.status !== 0) process.exit(1);
}
const [command, ...args] = process.argv.slice(2);
if (!command) throw new Error("Container start command is required");
const child = spawn(command, args, { stdio: "inherit" });
for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("error", () => process.exit(1));
child.on("exit", (code, signal) => process.exit(code ?? (signal === "SIGTERM" ? 0 : 1)));
