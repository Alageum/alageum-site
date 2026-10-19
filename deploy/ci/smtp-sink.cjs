"use strict";
// Invoked only by run-proof.sh in a disposable container sharing the backend's
// network namespace. The reused fixture binds loopback and cannot relay mail.
const fs = require("node:fs");
const { startSmtpCapture } = require("/app/tests/helpers/local-smtp-capture.js");
async function main() {
  process.umask(0o077);
  const smtp = await startSmtpCapture({
    key: fs.readFileSync("/fixture-tls/server.key"),
    cert: fs.readFileSync("/fixture-tls/server.crt"), port: 2525,
  });
  function snapshot() {
    fs.writeFileSync("/capture/messages.next", JSON.stringify(smtp.messages), { mode: 0o600 });
    fs.renameSync("/capture/messages.next", "/capture/messages.json");
  }
  snapshot();
  const timer = setInterval(snapshot, 100);
  for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, async () => {
    clearInterval(timer); snapshot(); await smtp.close(); process.exit(0);
  });
}
main().catch(() => { console.error("Disposable SMTP fixture failed"); process.exit(1); });
