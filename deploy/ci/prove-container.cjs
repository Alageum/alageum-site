"use strict";
// Sent on stdin to the actual backend container; not added to production code.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { Client } = require("pg");
const { scanBytes } = require("/app/src/domain/media-scanner");
const { readMediaConfig } = require("/app/src/domain/media-policy");
const phase = process.argv[2];
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jvL0AAAAASUVORK5CYII=", "base64");
async function main() {
  process.umask(0o022);
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
  await client.connect();
  try {
    const secure = await client.query("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()");
    assert.equal(secure.rows[0].ssl, true);
    const role = await client.query("SELECT rolsuper, rolcreatedb, rolcreaterole FROM pg_roles WHERE rolname = current_user");
    assert.deepEqual(role.rows[0], { rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  } finally { await client.end(); }
  const plaintext = new Client({ connectionString: process.env.DATABASE_URL, ssl: false });
  try { await assert.rejects(plaintext.connect(), /pg_hba.conf rejects|no pg_hba.conf entry/i); }
  finally { await plaintext.end(); }
  const publicFile = "/var/lib/alageum/public/uploads/server-proof.png";
  const privateFile = "/var/lib/alageum/private-quarantine/server-proof.bin";
  const documentStorage = require("/app/src/domain/document-files").createDocumentStorage();
  const documentManifest = "/var/lib/alageum/private-quarantine/document-proof.json";
  const documentBytes = Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n");
  const privateBytes = Buffer.from("Synthetic private quarantine persistence marker\n");
  if (phase === "initial") {
    const scanner = readMediaConfig().scanner;
    await scanBytes(png, scanner);
    // Official harmless EICAR fixture, never executed or written to public media.
    // https://www.eicar.org/download-anti-malware-testfile/
    const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$" + "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
    assert.equal(eicar.length, 68);
    await assert.rejects(scanBytes(eicar, scanner), error => error.code === "media_malware_detected");
    const documentInput = "/tmp/alageum-document-proof.pdf";
    fs.writeFileSync(documentInput, documentBytes, { flag: "wx", mode: 0o600 });
    try {
      const admitted = await documentStorage.admit({ filepath: documentInput, originalFilename: "proof.pdf", mimetype: "application/pdf" });
      const key = await documentStorage.store(admitted);
      const row = { storage_backend: "private-local-v1", storage_key: key, original_name: "proof.pdf", content_type: "application/pdf", size_bytes: documentBytes.length, checksum_sha256: admitted.checksum };
      assert.deepEqual(await documentStorage.read(row), documentBytes);
      fs.writeFileSync(documentManifest, JSON.stringify(row), { flag: "wx", mode: 0o600 });
    } finally { fs.unlinkSync(documentInput); }
    fs.writeFileSync(publicFile, png, { flag: "wx", mode: 0o640 });
    fs.writeFileSync(privateFile, privateBytes, { flag: "wx", mode: 0o600 });
    console.log("Passed: verified PostgreSQL TLS, app least privilege, plaintext refusal, real ClamAV clean/EICAR");
  } else {
    assert.deepEqual(await documentStorage.read(JSON.parse(fs.readFileSync(documentManifest,"utf8"))), documentBytes);
    assert.deepEqual(fs.readFileSync(publicFile), png);
    assert.deepEqual(fs.readFileSync(privateFile), privateBytes);
    assert.equal(fs.statSync(privateFile).mode & 0o077, 0);
    console.log("Passed: PostgreSQL TLS plus exact public/private persistent bytes");
  }
}
main().catch(() => { console.error("Container acceptance failed; inspect the named disposable checks"); process.exitCode = 1; });
