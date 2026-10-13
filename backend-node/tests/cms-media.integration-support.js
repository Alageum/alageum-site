"use strict";
const assert = require("node:assert/strict");
const { createHash, randomUUID } = require("node:crypto");
const { createCatalog, PRODUCT } = require("../src/domain/catalog");
const { createCmsCatalogAuthorizer, ACTION } = require("../src/domain/cms-catalog");
const { readCatalog } = require("../src/domain/catalog-source");
const { audit } = require("../src/domain/audit");
const manifest = require("../data/catalog-media-manifest.json");
const parse = (value) => typeof value === "string" ? JSON.parse(value) : value;
const unchanged = (row) => Object.fromEntries(Object.entries(row).filter(([key]) => !["media", "version", "updated_at", "status"].includes(key)));

async function runCmsMediaTests(t, app, { request, base, editor, denied, businessToken, adminId, valid, fixtures, login }) {
  const db = app.db.connection;
  const row = (id) => db(PRODUCT).where({ transport_id: id }).first();
  const events = (id) => db.withSchema("b2b").table("audit_events").where({ entity_id: id }).orderBy("created_at").orderBy("id");
  async function json(response, status = 200) {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  }
  const get = async (id) => {
    if (!/^[a-f0-9-]{36}$/i.test(id)) id = (await db(PRODUCT).where({ public_key: id }).first()).transport_id;
    return request(`/alageum-catalog/products/${id}`).then(json);
  };
  const choices = (id, token = editor) => request(`/alageum-catalog/products/${id}/media-options`, token).then(json);
  const update = (product, media, token = editor, method = "PUT", extra = {}) => request(`/alageum-catalog/products/${product.id}`, token, method, { version: product.version, media, ...extra });
  const preview = (id, entry, token = editor) => request(`/alageum-catalog/products/${id}/media-preview/${entry}`, token);
  // Restore imported fixtures exactly, including their version and source JSONB,
  // so these tests cannot alter the baseline of subsequent catalog/RFQ cases.
  async function fixture(key, work) {
    const before = await db(PRODUCT).where({ public_key: key }).first();
    assert.ok(before, `Imported fixture ${key}`);
    try { return await work(await get(before.transport_id), before); }
    finally {
      await db(PRODUCT).where({ transport_id: before.transport_id }).update({
        media: JSON.stringify(parse(before.media)),
        source_data: parse(before.source_data),
        version: before.version,
        status: before.status,
        updated_at: before.updated_at,
      });
    }
  }

  await t.test("native media choices bind exact source evidence and serve authenticated raster bytes without touching the product", async () => {
    for (const key of ["kso-366", "cat-bktp-modular-v001"]) await fixture(key, async (product, stored) => {
      const recorded = await events(product.id);
      const response = await request(`/alageum-catalog/products/${product.id}/media-options`);
      assert.equal(response.headers.get("cache-control"), "private, no-store");
      const options = await json(response);
      const expected = manifest.records[key];
      assert.equal(options.product_id, product.id);
      assert.equal(options.public_key, key);
      assert.equal(options.version, product.version);
      assert.deepEqual(options.source_pages, expected.source_pages);
      assert.deepEqual(options.imported, expected.imported);
      assert.deepEqual(options.reviewed, expected.reviewed);
      assert.deepEqual(options.entries, expected.entry_ids.map((id) => manifest.assets[id]));
      assert.equal(options.baseline_override, key === "cat-bktp-modular-v001");
      assert.ok(options.entries.length > 0);
      for (const entry of options.entries) {
        assert.ok(options.reviewed.some((item) => item.path === entry.path && item.kind === entry.kind));
        const image = await preview(product.id, entry.id);
        assert.equal(image.status, 200);
        assert.equal(image.headers.get("content-type"), entry.mime);
        assert.equal(image.headers.get("x-content-type-options"), "nosniff");
        assert.equal(image.headers.get("cache-control"), "private, no-store");
        const bytes = Buffer.from(await image.arrayBuffer());
        assert.equal(bytes.length, entry.bytes);
        assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.sha256);
        assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
        assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
      }
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
    });
  });

  await t.test("native options, preview and media writes deny non-managers, B2B identities and revoked native authority", async () => {
    await fixture("kso-366", async (product, stored) => {
      const options = await choices(product.id), entry = options.entries[0];
      const recorded = await events(product.id);
      async function deniedOperations(token, status) {
        assert.equal((await request(`/alageum-catalog/products/${product.id}/media-options`, token)).status, status);
        assert.equal((await preview(product.id, entry.id, token)).status, status);
        for (const method of ["PUT", "PATCH"]) assert.equal((await update(product, [], token, method)).status, status);
      }
      for (const [token, status] of [[null, 401], [denied, 403], [businessToken, 401]]) await deniedOperations(token, status);
      const tenantLogin = await json(await request("/api/v1/auth/login", null, "POST", { email: "admin@demo.example", password: "ChangeMe123!" }));
      await deniedOperations(tenantLogin.access_token, 401);
      await app.service("admin::role").assignPermissions(fixtures.roles.editor, []);
      try { await deniedOperations(editor, 403); }
      finally { await app.service("admin::role").assignPermissions(fixtures.roles.editor, [{ action: ACTION, subject: null, properties: {}, conditions: [] }]); }
      for (const mutation of [{ roles: [fixtures.roles.denied] }, { isActive: false }]) {
        await app.service("admin::user").updateById(adminId, mutation);
        try { await deniedOperations(editor, mutation.roles ? 403 : 401); }
        finally { await app.service("admin::user").updateById(adminId, { isActive: true, roles: [fixtures.roles.editor] }); }
      }
      const revoked = await login("editor");
      const session = app.sessionManager("admin").validateAccessToken(revoked);
      assert.equal(session.isValid, true);
      assert.equal(await app.sessionManager("admin").revokeSessionById(String(adminId), session.payload.sessionId), true);
      await deniedOperations(revoked, 401);
      assert.equal((await request(`/alageum-catalog/products/${product.id}/media-options`, editor)).status, 200);
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
    });
  });

  await t.test("native media rejects mismatched products, brand assets, traversal and unreviewed additions atomically", async () => {
    await fixture("kso-366", async (product, stored) => {
      const options = await choices(product.id), recorded = await events(product.id);
      const unrelated = manifest.records["kso-292"].entry_ids[0];
      for (const id of [unrelated, "0".repeat(64), "..%2F..%2Fpackage.json", "%2Fbrand%2Flogo.png"]) {
        const response = await preview(product.id, id);
        assert.ok([400, 404, 422].includes(response.status), `${id}: ${response.status}`);
        assert.ok(!String(response.headers.get("content-type")).startsWith("image/"));
      }
      for (const media of [
        [{ path: "/brand/logo.png", kind: "image" }],
        [{ path: "/catalog-products/kso-292.webp", kind: "image" }],
        [{ path: "/catalog-products/../brand/logo.png", kind: "image" }],
        [{ path: "/catalog-source/page-023.webp", kind: "image" }],
        [{ ...options.reviewed[0], kind: "document" }],
        [...options.reviewed, ...options.reviewed],
      ]) {
        const result = await json(await update(product, media), 422);
        assert.equal(result.error.code, "validation_error");
        assert.ok(result.error.details.some((error) => error.loc[0] === "media"));
      }
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
      await db(PRODUCT).where({ transport_id: product.id }).update({ source_data: { ...parse(stored.source_data), name: "Mismatched source evidence" } });
      const mismatched = await choices(product.id);
      assert.deepEqual(mismatched.entries, []);
      assert.deepEqual(mismatched.reviewed, []);
      assert.equal((await preview(product.id, options.entries[0].id)).status, 404);
      assert.equal((await update(product, [{ ...product.media[0], alt: "Changed" }])).status, 422);
      assert.deepEqual(await events(product.id), recorded);
    });
  });

  await t.test("new and source-empty products never acquire reviewed media through editable provenance", async () => {
    const keys = Object.entries(manifest.records).filter(([, value]) => value.reviewed.length === 0).map(([key]) => key);
    assert.equal(keys.length, 24);
    for (const key of keys) {
      const product = await get(key), options = await choices(product.id);
      assert.deepEqual(options.entries, []);
      assert.deepEqual(options.reviewed, []);
      assert.equal(options.baseline_override, false);
    }
    const product = await json(await request("/alageum-catalog/products", editor, "POST", {
      ...valid(), provenance: { sourcePages: [23], imageSourcePage: 23 },
    }), 201);
    assert.deepEqual((await choices(product.id)).entries, []);
    assert.equal((await update(product, manifest.records["kso-366"].reviewed)).status, 422);
    const invalid = { ...valid(), media: [{ path: "/brand/logo.png", kind: "image" }] };
    assert.equal((await request("/alageum-catalog/products", editor, "POST", invalid)).status, 422);
    assert.equal(await db(PRODUCT).where({ public_key: invalid.public_key }).first(), undefined);
    assert.equal((await get(product.id)).version, 1);
  });

  await t.test("native media preserves absent, null and empty alt, immutable legacy values and duplicate counts; global v1 retains its allowlist", async () => {
    await fixture("kso-366", async (original, stored) => {
      const reviewed = (await choices(original.id)).reviewed[0];
      const legacy = [{ path: "/brand/logo.png", kind: "image" }, { path: "/brand/logo.png", kind: "image", alt: null }];
      // An actual v1 write establishes pre-existing allowed legacy attachments.
      let product = await json(await request(`/api/v1/admin/catalog/products/${original.id}`, businessToken, "PATCH", { version: original.version, media: [...legacy, { ...reviewed, alt: "" }] }));
      assert.deepEqual(product.media, [...legacy, { ...reviewed, alt: "" }]);
      const reordered = [{ ...reviewed, alt: null }, legacy[1], legacy[0]];
      product = await json(await update(product, reordered));
      assert.deepEqual(product.media, reordered);
      const recorded = await events(product.id);
      for (const invalid of [
        [{ ...legacy[0], alt: "" }, ...reordered.slice(0, 2)],
        [legacy[0], legacy[0], legacy[1], reviewed],
        [legacy[1], legacy[1], reviewed],
      ]) assert.equal((await update(product, invalid)).status, 422);
      assert.deepEqual(await events(product.id), recorded);
      product = await json(await update(product, [{ path: reviewed.path, kind: "image" }, legacy[0]], editor, "PATCH"));
      assert.equal(Object.hasOwn(product.media[0], "alt"), false);
      assert.equal(Object.hasOwn(product.media[1], "alt"), false);
      product = await json(await update(product, [{ ...reviewed, alt: "" }]));
      assert.equal((await update(product, [legacy[0], ...product.media])).status, 422);
      assert.deepEqual(unchanged(await row(product.id)), unchanged(stored));
    });
  });

  await t.test("imported page39 singleton is read-only legacy until explicit reviewed page38 replacement", async () => {
    await fixture("cat-bktp-modular-v001", async (original, stored) => {
      const options = await choices(original.id);
      assert.equal(options.baseline_override, true);
      assert.equal(options.imported[0].path, "/catalog-products/cat-bktp-modular.webp");
      assert.equal(options.reviewed[0].path, "/catalog-source/page-038.webp");
      assert.equal(options.entries[0].representation, "source-scan");
      assert.deepEqual(options.entries[0].source_pages, [38]);
      assert.deepEqual((await json(await request(`/api/v1/catalog/products/${original.id}`, null))).media, original.media);
      assert.deepEqual(await row(original.id), stored);
      assert.equal((await update(original, [{ ...original.media[0], alt: "Changing legacy alt must not trigger reviewed fallback" }])).status, 422);
      let product = await json(await update(original, options.reviewed));
      assert.equal((await choices(product.id)).baseline_override, false);
      assert.deepEqual(product.media, options.reviewed);
      assert.equal((await update(product, options.imported)).status, 422);
      product = await json(await update(product, []));
      assert.deepEqual(product.media, []);
      assert.equal((await choices(product.id)).baseline_override, false);
      product = await json(await update(product, options.reviewed));
      assert.deepEqual((await json(await request(`/api/v1/catalog/products/${original.id}`, null))).media, options.reviewed);
      assert.deepEqual(unchanged(await row(product.id)), unchanged(stored));
    });
  });

  await t.test("native media conflicts and audit failures leave one winning JSONB update with exact CMS audit evidence", async () => {
    await fixture("kso-366", async (product, stored) => {
      const recorded = await events(product.id), reviewed = (await choices(product.id)).reviewed[0];
      const alternatives = [[{ ...reviewed, alt: "First reviewed description" }], [{ ...reviewed, alt: null }]];
      const responses = await Promise.all(alternatives.map((media) => update(product, media)));
      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
      const winner = responses.findIndex((response) => response.status === 200);
      const saved = await json(responses[winner]);
      const conflict = await json(responses[1 - winner], 409);
      assert.equal(conflict.error.code, "catalog_version_conflict");
      assert.equal(conflict.error.details.current_version, product.version + 1);
      assert.deepEqual(parse((await row(product.id)).media), alternatives[winner]);
      const changed = (await events(product.id)).filter((event) => !recorded.some((old) => old.id === event.id));
      assert.equal(changed.length, 1);
      const evidence = parse(changed[0].event_metadata);
      assert.equal(changed[0].actor_user_id, null);
      assert.equal(changed[0].organization_id, null);
      assert.equal(evidence.source, "cms");
      assert.equal(evidence.cms_admin_id, String(adminId));
      assert.deepEqual(evidence.changed_fields, ["media"]);
      assert.deepEqual(evidence.before.media, product.media);
      assert.deepEqual(evidence.after.media, alternatives[winner]);
      const beforeFailure = await row(product.id), auditsBeforeFailure = await events(product.id), originalCatalog = app.alageum.cmsCatalog;
      let reachedAudit = false;
      app.alageum.cmsCatalog = createCatalog({ db, authorizer: createCmsCatalogAuthorizer({ strapi: app }), audit: async (tx, ctx, event) => {
        reachedAudit = true;
        await audit(tx, ctx, event);
        throw new Error("cms media audit rollback fixture");
      } });
      try { assert.equal((await update(saved, [])).status, 500); }
      finally { app.alageum.cmsCatalog = originalCatalog; }
      assert.equal(reachedAudit, true);
      assert.deepEqual(await row(product.id), beforeFailure);
      assert.deepEqual(await events(product.id), auditsBeforeFailure);
      assert.deepEqual(unchanged(await row(product.id)), unchanged(stored));
    });
  });

  await t.test("hide, restore, reimport and RFQ replay preserve media and never rewrite RFQ snapshots or provenance", async () => {
    await fixture("kso-366", async (original, stored) => {
      const buyerLogin = await json(await request("/api/v1/auth/login", null, "POST", { email: "buyer@demo.example", password: "ChangeMe123!" }));
      const key = randomUUID();
      const submit = (submissionKey) => fetch(`${base}/api/v1/quotes/catalog`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${buyerLogin.access_token}`, "Idempotency-Key": submissionKey }, body: JSON.stringify({ items: [{ product_id: original.id, quantity: "1.000" }] }) });
      const quote = await json(await submit(key), 201), snapshot = quote.items[0].product_snapshot;
      const snapshotRow = () => db.withSchema("b2b").table("quote_request_items").where({ quote_request_id: quote.id, product_id: original.id }).first();
      const initialSnapshot = (await snapshotRow()).product_snapshot;
      const media = [{ ...(await choices(original.id)).reviewed[0], alt: "Reviewed editable alt" }];
      let product = await json(await update(original, media));
      product = await json(await request(`/alageum-catalog/products/${product.id}/hide`, editor, "POST", { version: product.version }));
      assert.deepEqual(product.media, media);
      assert.equal((await request(`/api/v1/catalog/products/${product.id}`, null)).status, 404);
      assert.equal((await app.alageum.catalog.importRecords(readCatalog())).created, 0);
      assert.deepEqual(parse((await row(product.id)).media), media);
      assert.equal((await row(product.id)).status, "hidden");
      product = await json(await request(`/alageum-catalog/products/${product.id}/restore`, editor, "POST", { version: product.version }));
      assert.equal(product.status, "draft");
      assert.deepEqual(product.media, media);
      product = await json(await update(product, media, editor, "PATCH", { status: "published" }));
      assert.deepEqual((await json(await request(`/api/v1/catalog/products/${product.id}`, null))).media, media);
      const comparison = await json(await request("/api/v1/catalog/compare", null, "POST", { product_ids: [product.id, (await get("kso-292")).id] }));
      assert.deepEqual(comparison.find((item) => item.id === product.id).media, media);
      const replay = await json(await submit(key));
      assert.equal(replay.id, quote.id);
      assert.deepEqual(replay.items[0].product_snapshot, snapshot);
      assert.deepEqual((await snapshotRow()).product_snapshot, initialSnapshot);
      const fresh = await json(await submit(randomUUID()), 201);
      assert.equal(fresh.items[0].product_snapshot.version, product.version);
      for (const data of [snapshot, fresh.items[0].product_snapshot]) for (const key of ["media", "provenance", "source_data"]) assert.equal(Object.hasOwn(data, key), false);
      assert.deepEqual(unchanged(await row(product.id)), unchanged(stored));
    });
  });
}

module.exports = { runCmsMediaTests };
