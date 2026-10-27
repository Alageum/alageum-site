"use strict";
// Browser-only fixture installed AFTER the runner's Strapi reload. Never imported
// by application bootstrap. Scanner is a protocol double, not real ClamAV proof.
const { randomUUID } = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const argon2 = require("argon2");
const { validateFixtureEnvironment } = require("../scripts/seed-test-document-users");
const { table } = require("../src/domain/auth");
const { audit } = require("../src/domain/audit");
const { createDocuments } = require("../src/domain/documents");
const { createDocumentStorage } = require("../src/domain/document-files");
const { scannerFixture } = require("./helpers/media-scanner-fixture");
module.exports = async function browserFileFixture({ app, after }) {
  const { database, password } = validateFixtureEnvironment();
  if (app.config.get("alageum.env") !== "test" || app.config.get("alageum.seedDemo") === true) throw new Error("Browser file fixture requires isolated test mode");
  const db = app.db.connection;
  if ((await db.raw("SELECT current_database() AS database")).rows[0].database !== database) throw new Error("Browser file fixture database mismatch");
  const scanner = await scannerFixture({ after });
  const root = path.join(scanner.root, "browser-private-documents");
  await fs.mkdir(root, { mode: 0o700 });
  const organization = randomUUID(), otherOrganization = randomUUID(), user = randomUUID();
  const email = "document-uploader@fixture.invalid";
  const passwordHash = await argon2.hash(password);
  await db.transaction(async tx => {
    if (await table(tx, "users").where({ email }).first()) throw new Error("Browser uploader fixture refuses reseed");
    await table(tx, "users").insert({ id: user, email, display_name: "Fictitious private file uploader", password_hash: passwordHash });
    for (const id of [organization, otherOrganization]) {
      const role = randomUUID();
      await table(tx, "organizations").insert({ id, name: `Fictitious browser upload ${id === organization ? "A" : "B"}`, external_id: `DISPOSABLE-BROWSER-${id}` });
      await table(tx, "roles").insert({ id: role, organization_id: id, code: "document_browser_uploader", name: "Disposable uploader", permissions: JSON.stringify(["document.read", "document.create"]) });
      await table(tx, "memberships").insert({ id: randomUUID(), user_id: user, organization_id: id, role_id: role });
    }
  });
  const original = app.alageum.documents;
  app.alageum.documents = createDocuments({ db, auth: app.alageum.auth, audit, storage: createDocumentStorage({ ...scanner.config, root }) });
  after(async () => { app.alageum.documents = original; });
  return { organization, otherOrganization, scanner };
};
