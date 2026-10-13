const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
function walk(root) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".js"))
      execFileSync(process.execPath, ["--check", file], { stdio: "inherit" });
  }
}
for (const root of ["src", "config", "scripts"]) walk(root);
