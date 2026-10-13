"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { validateUploadEnvironment, snapshotFiles } = require("./cms-upload.integration-support");
function inputs() {
  return { env: { APP_ENV: "test", ALAGEUM_TEST_ADMIN_FIXTURES: "1", DATABASE_URL: "postgresql://fixture:local@127.0.0.1:5432/alageum_strapi_test" },
    app: { config: { get: key => key === "alageum.env" ? "test" : "local" }, server: { httpServer: { address: () => ({ address: "127.0.0.1" }) } } } };
}
test("upload harness accepts only explicit named loopback test fixtures", () => {
  const { env, app } = inputs(); assert.equal(validateUploadEnvironment(env, app), "alageum_strapi_test");
  for (const mutation of [{ APP_ENV: "production" }, { ALAGEUM_TEST_ADMIN_FIXTURES: "0" },
    { DATABASE_URL: "postgresql://fixture:local@db.example/alageum_strapi_test" },
    { DATABASE_URL: "postgresql://fixture:local@127.0.0.1/alageum_strapi_live" },
    { DATABASE_URL: `${env.DATABASE_URL}?host=other` }, { DATABASE_URL: "file:///alageum_strapi_test" }]) {
    assert.throws(() => validateUploadEnvironment({ ...env, ...mutation }, app));
  }
  assert.throws(() => validateUploadEnvironment(env, { ...app, config: { get: () => "remote" } }));
});
test("upload snapshots hash all preexisting bytes and refuse symbolic links", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alageum-upload-snapshot-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "nested")); await fs.writeFile(path.join(root, "nested", "sentinel"), "original");
  const before = await snapshotFiles(root); assert.deepEqual(Object.keys(before), ["nested/sentinel"]);
  await fs.writeFile(path.join(root, "nested", "sentinel"), "changed!"); assert.notDeepEqual(await snapshotFiles(root), before);
  await fs.symlink(path.join(root, "nested", "sentinel"), path.join(root, "link"));
  await assert.rejects(snapshotFiles(root), /symbolic links/);
});
