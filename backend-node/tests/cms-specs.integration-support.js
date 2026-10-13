"use strict";
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { createCatalog, PRODUCT, CATEGORY } = require("../src/domain/catalog");
const { createCmsCatalogAuthorizer } = require("../src/domain/cms-catalog");
const { audit } = require("../src/domain/audit");
const { DEMO } = require("../src/domain/auth");
const parse = (value) =>
  typeof value === "string" ? JSON.parse(value) : value;

// Numeric-looking strings, zero, false, null and absent fields must survive JSONB
// and native HTTP without the editor changing their meaning. Extra evidence is
// deliberately present at each passthrough boundary in the existing schema.
function originalSpecs() {
  return {
    power: 0,
    voltage: "0.4/10",
    voltageUnit: null,
    cooling: "",
    isOrderableSku: false,
    manufacturer: "Алматы",
    manufacturers: ["Алматы", "Plant 2"],
    notes: ["  Keep whitespace  ", "Сертификат № 007"],
    variantIds: ["variant-007"],
    technicalSpecs: [
      {
        label: "Text",
        value: "001.250\nsecond source line",
        unit: "кВА",
        page: 3,
        evidence: { source: "table A", reviewed: false, reference: null },
      },
      { label: "Zero", value: 0, unit: null, page: 4 },
      { label: "No unit", value: "", sourceColumn: 0 },
      { label: "Empty unit", value: 12.5, unit: "" },
    ],
    variantSpecs: [
      {
        label: "Variant",
        value: "0007",
        unit: null,
        page: 5,
        imported: { flags: [false, null, "007", 7] },
      },
    ],
    configurations: [
      {
        designation: "КТП-007",
        specifications: [
          {
            label: "Rating",
            value: 630,
            unit: "кВА",
            page: 8,
            sourceRow: { id: "008", measured: false },
          },
          { label: "Code", value: "0630", unit: null },
          { label: "Without unit", value: 0 },
        ],
        sourcePages: [8, 9],
        available: false,
        evidence: { revision: "01", obsolete: null },
      },
      { designation: "No rows", annotation: { value: null } },
    ],
    importedMetadata: { active: false, value: null, edition: "001", page: 0 },
  };
}

function replacementSpecs() {
  const specs = originalSpecs();
  specs.power = null;
  specs.voltage = null;
  specs.voltageUnit = "кВ";
  specs.isOrderableSku = true;
  specs.notes = [];
  specs.manufacturers = ["Plant 2"];
  specs.variantIds = [];
  specs.technicalSpecs = [
    specs.technicalSpecs[2],
    { ...specs.technicalSpecs[0], value: 125.75, unit: null },
    { label: "Added", value: "000", page: 10 },
  ];
  specs.variantSpecs = [];
  specs.configurations = [
    {
      ...specs.configurations[0],
      designation: "КТП-008",
      specifications: [
        specs.configurations[0].specifications[2],
        { ...specs.configurations[0].specifications[0], value: "0800" },
      ],
    },
    { designation: "Added configuration", specifications: [] },
  ];
  delete specs.importedMetadata;
  delete specs.cooling;
  return specs;
}

async function runCmsSpecsTests(
  t,
  app,
  { request, base, editor, denied, businessToken, adminId, valid },
) {
  const db = app.db.connection;
  const row = (id) => db(PRODUCT).where({ transport_id: id }).first();
  const events = (id) =>
    db
      .withSchema("b2b")
      .table("audit_events")
      .where({ entity_id: id })
      .orderBy("created_at")
      .orderBy("id");
  async function json(response, status) {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  }
  async function create(specs = originalSpecs(), extra = {}) {
    return json(
      await request("/alageum-catalog/products", editor, "POST", {
        ...valid(),
        specs,
        ...extra,
      }),
      201,
    );
  }
  async function update(product, specs, method = "PUT", extra = {}) {
    return request(`/alageum-catalog/products/${product.id}`, editor, method, {
      version: product.version,
      specs,
      ...extra,
    });
  }
  async function loginBusiness(name) {
    const result = await json(
      await request("/api/v1/auth/login", null, "POST", {
        email: `${name}@demo.example`,
        password: "ChangeMe123!",
      }),
      200,
    );
    return result.access_token;
  }

  await t.test(
    "native specs roundtrip typed values, unit presence and row/configuration evidence; replacement removes omitted data",
    async () => {
      const before = originalSpecs();
      const product = await create(before);
      assert.deepEqual(product.specs, before);
      assert.deepEqual(parse((await row(product.id)).specs), before);
      const after = replacementSpecs();
      const saved = await json(await update(product, after), 200);
      assert.equal(saved.version, 2);
      assert.deepEqual(saved.specs, after);
      const reread = await json(
        await request(`/alageum-catalog/products/${product.id}`),
        200,
      );
      assert.deepEqual(reread.specs, after);
      assert.deepEqual(parse((await row(product.id)).specs), after);
      assert.equal(
        Object.hasOwn(reread.specs.technicalSpecs[0], "unit"),
        false,
      );
      assert.equal(reread.specs.technicalSpecs[1].unit, null);
      assert.equal(Object.hasOwn(reread.specs, "importedMetadata"), false);
      assert.equal(Object.hasOwn(reread.specs, "cooling"), false);

      // Saving an unrelated product field must leave every existing spec intact.
      const unrelated = await json(
        await request(
          `/alageum-catalog/products/${product.id}`,
          editor,
          "PATCH",
          {
            version: 2,
            price: "160.00",
          },
        ),
        200,
      );
      assert.deepEqual(unrelated.specs, after);
      // An explicit empty replacement must clear the spec, rather than merge it.
      const cleared = await json(await update(unrelated, {}, "PATCH"), 200);
      assert.deepEqual(cleared.specs, {});
      assert.deepEqual(parse((await row(product.id)).specs), {});
    },
  );

  await t.test(
    "native spec validation reports exact field locations without persisting partial edits or audits",
    async () => {
      const product = await create();
      const stored = await row(product.id),
        recorded = await events(product.id);
      const invalid = [
        [null, ["specs"]],
        [
          { technicalSpecs: [{ label: "Flag", value: true }] },
          ["specs", "technicalSpecs", 0, "value"],
        ],
        [
          { technicalSpecs: [{ label: "Missing", value: null }] },
          ["specs", "technicalSpecs", 0, "value"],
        ],
        [
          { technicalSpecs: [{ label: "Unit", value: 1, unit: 7 }] },
          ["specs", "technicalSpecs", 0, "unit"],
        ],
        [
          { technicalSpecs: [{ label: "Page", value: 1, page: 0 }] },
          ["specs", "technicalSpecs", 0, "page"],
        ],
        [
          { variantSpecs: [{ value: 1 }] },
          ["specs", "variantSpecs", 0, "label"],
        ],
        [
          { configurations: [{ designation: 7 }] },
          ["specs", "configurations", 0, "designation"],
        ],
        [
          {
            configurations: [
              {
                designation: "A",
                specifications: [{ label: "Nested", value: {} }],
              },
            ],
          },
          ["specs", "configurations", 0, "specifications", 0, "value"],
        ],
        [{ power: -1 }, ["specs", "power"]],
        [{ isOrderableSku: "false" }, ["specs", "isOrderableSku"]],
        [{ notes: [false] }, ["specs", "notes", 0]],
        [{ manufacturers: [null] }, ["specs", "manufacturers", 0]],
        [{ variantIds: [7] }, ["specs", "variantIds", 0]],
        [
          {
            technicalSpecs: Array.from({ length: 501 }, () => ({
              label: "x",
              value: 1,
            })),
          },
          ["specs", "technicalSpecs"],
        ],
        [{ notes: ["x".repeat(256 * 1024)] }, ["specs"]],
      ];
      for (const [specs, loc] of invalid) {
        const result = await json(await update(product, specs), 422);
        assert.equal(result.error.code, "validation_error");
        assert.ok(
          result.error.details.some(
            (error) =>
              JSON.stringify(error.loc) === JSON.stringify(loc) &&
              error.msg.length > 0,
          ),
          `Expected validation at ${JSON.stringify(loc)}: ${JSON.stringify(result.error.details)}`,
        );
      }
      const invalidCreate = {
        ...valid(),
        specs: {
          configurations: [
            {
              designation: "A",
              specifications: [{ label: "Nested", value: true }],
            },
          ],
        },
      };
      const result = await json(
        await request(
          "/alageum-catalog/products",
          editor,
          "POST",
          invalidCreate,
        ),
        422,
      );
      assert.equal(result.error.code, "validation_error");
      assert.deepEqual(result.error.details[0].loc, [
        "specs",
        "configurations",
        0,
        "specifications",
        0,
        "value",
      ]);
      assert.equal(
        await db(PRODUCT)
          .where({ public_key: invalidCreate.public_key })
          .first(),
        undefined,
      );
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
    },
  );

  await t.test(
    "native spec saves reject missing categories and publishing into an unpublished category atomically",
    async () => {
      const product = await create();
      const stored = await row(product.id),
        recorded = await events(product.id);
      const categoryId = randomUUID(),
        categoryKey = `cms-spec-category-${randomUUID()}`;
      await db(CATEGORY).insert({
        transport_id: categoryId,
        document_id: randomUUID().replaceAll("-", "").slice(0, 24),
        public_key: categoryKey,
        slug: categoryKey,
        translations: { ru: { name: "Unpublished spec fixture" } },
        is_published: false,
        sort_order: 0,
        created_at: new Date(),
        updated_at: new Date(),
        published_at: new Date(),
      });
      for (const [category_id, code] of [
        [randomUUID(), "category_not_found"],
        [categoryId, "category_not_published"],
      ]) {
        const result = await json(
          await update(product, replacementSpecs(), "PATCH", { category_id }),
          422,
        );
        assert.equal(result.error.code, code);
        const data = { ...valid(), category_id, specs: originalSpecs() };
        const failedCreate = await json(
          await request("/alageum-catalog/products", editor, "POST", data),
          422,
        );
        assert.equal(failedCreate.error.code, code);
        assert.equal(
          await db(PRODUCT).where({ public_key: data.public_key }).first(),
          undefined,
        );
      }
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
      // The existing contract still permits draft work in an unpublished category.
      const draft = await create(originalSpecs(), {
        category_id: categoryId,
        status: "draft",
      });
      const saved = await json(await update(draft, replacementSpecs()), 200);
      assert.equal(saved.status, "draft");
      assert.deepEqual(saved.specs, replacementSpecs());
      const publishing = await json(
        await request(`/alageum-catalog/products/${draft.id}`, editor, "PUT", {
          version: 2,
          status: "published",
          specs: {},
        }),
        422,
      );
      assert.equal(publishing.error.code, "category_not_published");
      assert.deepEqual(parse((await row(draft.id)).specs), replacementSpecs());
      assert.equal((await row(draft.id)).version, 2);
    },
  );

  await t.test(
    "native spec writes require native management permission and never confer tenant or business authority",
    async () => {
      const product = await create();
      const stored = await row(product.id),
        recorded = await events(product.id);
      const tenantAdmin = await loginBusiness("admin");
      for (const [token, status] of [
        [denied, 403],
        [businessToken, 401],
        [tenantAdmin, 401],
      ]) {
        assert.equal(
          (await request(`/alageum-catalog/products/${product.id}`, token))
            .status,
          status,
        );
        const data = { ...valid(), specs: replacementSpecs() };
        assert.equal(
          (await request("/alageum-catalog/products", token, "POST", data))
            .status,
          status,
        );
        assert.equal(
          await db(PRODUCT).where({ public_key: data.public_key }).first(),
          undefined,
        );
        for (const method of ["PUT", "PATCH"]) {
          assert.equal(
            (
              await request(
                `/alageum-catalog/products/${product.id}`,
                token,
                method,
                {
                  version: 1,
                  specs: replacementSpecs(),
                },
              )
            ).status,
            status,
          );
        }
      }
      assert.equal(
        (
          await request(
            `/api/v1/admin/catalog/products/${product.id}`,
            tenantAdmin,
            "PATCH",
            {
              version: 1,
              specs: replacementSpecs(),
            },
          )
        ).status,
        403,
      );
      assert.equal(
        (
          await request(
            `/api/v1/admin/catalog/products/${product.id}`,
            editor,
            "PATCH",
            {
              version: 1,
              specs: replacementSpecs(),
            },
          )
        ).status,
        401,
      );
      for (const organization_id of [DEMO.organizationA, DEMO.organizationB]) {
        const result = await json(
          await update(product, replacementSpecs(), "PUT", { organization_id }),
          422,
        );
        assert.equal(result.error.code, "validation_error");
      }
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
    },
  );

  await t.test(
    "concurrent native spec replacements have one winner and exact CMS before/after audit evidence",
    async () => {
      const product = await create();
      const choices = [
        replacementSpecs(),
        { ...originalSpecs(), notes: ["Other editor"] },
      ];
      const responses = await Promise.all(
        choices.map((specs) => update(product, specs)),
      );
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const winner = responses.findIndex((r) => r.status === 200);
      const saved = await responses[winner].json();
      const conflict = await responses[1 - winner].json();
      assert.equal(conflict.error.code, "catalog_version_conflict");
      assert.equal(conflict.error.details.current_version, 2);
      assert.equal(saved.version, 2);
      assert.deepEqual(saved.specs, choices[winner]);
      assert.deepEqual(parse((await row(product.id)).specs), choices[winner]);
      const recorded = await events(product.id);
      assert.equal(
        recorded.length,
        2,
        "Only create and the winning save may produce audits",
      );
      const created = recorded.find(
        (event) => event.action === "catalog.product.create",
      );
      const changed = recorded.find(
        (event) => event.action === "catalog.product.update",
      );
      assert.ok(created && changed);
      assert.deepEqual(
        parse(created.event_metadata).after.specs,
        originalSpecs(),
      );
      const evidence = parse(changed.event_metadata);
      assert.deepEqual(evidence.before.specs, originalSpecs());
      assert.deepEqual(evidence.after.specs, choices[winner]);
      assert.equal(evidence.before.version, 1);
      assert.equal(evidence.after.version, 2);
      assert.deepEqual(evidence.changed_fields, ["specs"]);
      for (const event of recorded) {
        assert.equal(event.actor_user_id, null);
        assert.equal(event.organization_id, null);
        assert.equal(parse(event.event_metadata).source, "cms");
        assert.equal(parse(event.event_metadata).cms_admin_id, String(adminId));
      }
    },
  );

  await t.test(
    "native spec audit failure rolls back written JSONB, version and the inserted audit event",
    async () => {
      const product = await create();
      const stored = await row(product.id),
        recorded = await events(product.id);
      const original = app.alageum.cmsCatalog,
        attempted = [];
      app.alageum.cmsCatalog = createCatalog({
        db,
        authorizer: createCmsCatalogAuthorizer({ strapi: app }),
        audit: async (tx, ctx, event) => {
          attempted.push(event);
          await audit(tx, ctx, event);
          throw new Error("cms spec audit rollback fixture");
        },
      });
      const data = { ...valid(), specs: originalSpecs() };
      try {
        assert.equal(
          (await request("/alageum-catalog/products", editor, "POST", data))
            .status,
          500,
        );
        assert.equal((await update(product, replacementSpecs())).status, 500);
      } finally {
        app.alageum.cmsCatalog = original;
      }
      assert.equal(
        attempted.length,
        2,
        "Both operations must reach the transactional audit",
      );
      assert.deepEqual(
        attempted.map((event) => event.action),
        ["catalog.product.create", "catalog.product.update"],
      );
      assert.deepEqual(
        attempted[1].event_metadata.after.specs,
        replacementSpecs(),
      );
      assert.equal(
        await db(PRODUCT).where({ public_key: data.public_key }).first(),
        undefined,
      );
      assert.deepEqual(await events(attempted[0].entity_id), []);
      assert.deepEqual(await row(product.id), stored);
      assert.deepEqual(await events(product.id), recorded);
    },
  );

  await t.test(
    "public detail/comparison and new RFQs see native spec edits while saved RFQ snapshots stay immutable",
    async () => {
      const product = await create(),
        other = await create({ power: 63 });
      const buyer = await loginBusiness("buyer");
      const payload = {
        items: [{ product_id: product.id, quantity: "2.500" }],
      };
      const key = randomUUID();
      const submit = (submissionKey) =>
        fetch(`${base}/api/v1/quotes/catalog`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${buyer}`,
            "Idempotency-Key": submissionKey,
          },
          body: JSON.stringify(payload),
        });
      const quote = await json(await submit(key), 201);
      const snapshot = quote.items[0].product_snapshot;
      assert.deepEqual(snapshot.specs, originalSpecs());
      assert.equal(snapshot.version, 1);
      const storedItem = () =>
        db
          .withSchema("b2b")
          .table("quote_request_items")
          .where({ quote_request_id: quote.id, product_id: product.id })
          .first();
      const storedSnapshot = (await storedItem()).product_snapshot;

      await json(await update(product, replacementSpecs()), 200);
      for (const id of [product.public_key, product.id]) {
        const publicProduct = await json(
          await request(`/api/v1/catalog/products/${id}`, null),
          200,
        );
        assert.deepEqual(publicProduct.specs, replacementSpecs());
        assert.equal(publicProduct.version, 2);
        assert.equal(Object.hasOwn(publicProduct, "source_data"), false);
      }
      const comparison = await json(
        await request("/api/v1/catalog/compare", null, "POST", {
          product_ids: [product.id, other.id],
        }),
        200,
      );
      assert.equal(comparison.length, 2);
      assert.deepEqual(
        comparison.find((item) => item.id === product.id).specs,
        replacementSpecs(),
      );
      assert.deepEqual(comparison.find((item) => item.id === other.id).specs, {
        power: 63,
      });
      const savedQuote = await json(
        await request(`/api/v1/quotes/${quote.id}`, buyer),
        200,
      );
      assert.deepEqual(savedQuote.items[0].product_snapshot, snapshot);
      assert.deepEqual((await storedItem()).product_snapshot, storedSnapshot);
      const replay = await json(await submit(key), 200);
      assert.equal(replay.id, quote.id);
      assert.deepEqual(replay.items[0].product_snapshot, snapshot);
      const newQuote = await json(await submit(randomUUID()), 201);
      assert.notEqual(newQuote.id, quote.id);
      assert.deepEqual(
        newQuote.items[0].product_snapshot.specs,
        replacementSpecs(),
      );
      assert.equal(newQuote.items[0].product_snapshot.version, 2);
      assert.equal(
        (await request(`/api/v1/quotes/${quote.id}`, editor)).status,
        401,
      );
    },
  );
}

module.exports = { runCmsSpecsTests };
