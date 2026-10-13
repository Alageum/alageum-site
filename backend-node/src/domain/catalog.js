"use strict";
const { randomUUID } = require("node:crypto");
const { validate: isUUID, v5: uuid5 } = require("uuid");
const { AppError } = require("./errors");
const { assertActiveContext } = require("./auth");
const v = require("./catalog-validation");
const nativeMedia = require("./catalog-media");
const { NAMESPACE, importedProductId, resolveCatalogReadId } = require("./catalog-identity");
const { requestPagination } = require("./legacy-query");
const CATEGORIES = {
  transformers: "Трансформаторы",
  switchgear: "Коммутация и распределение",
  substations: "Комплектные подстанции",
  cabinets: "Шкафы, щиты и управление",
  protection: "Катодная защита и измерение",
  reactors: "Реакторы",
  accessories: "Принадлежности трансформаторов",
};
const SPEC_FIELDS = [
  "designation",
  "execution",
  "productKind",
  "sourceRecordType",
  "technicalSpecs",
  "configurations",
  "power",
  "voltage",
  "voltageUnit",
  "cooling",
  "installation",
  "subtype",
  "manufacturer",
  "manufacturers",
  "recordKind",
  "recordType",
  "isOrderableSku",
  "series",
  "familyId",
  "familyName",
  "variantIds",
  "variantSpecs",
  "notes",
];
const PROVENANCE_FIELDS = [
  "sourceId",
  "sourceFileId",
  "sourceSha256",
  "sourceRow",
  "sourceFamilyId",
  "manufacturerEvidencePages",
  "sourceKind",
  "sourceUrl",
  "sourceTitle",
  "sourceCheckedAt",
  "sourcePages",
  "imageSourcePage",
  "additionalSources",
];
const PRODUCT = "alageum_products",
  CATEGORY = "alageum_categories";
const pick = (o, keys) =>
  Object.fromEntries(
    keys.filter((k) => Object.hasOwn(o, k)).map((k) => [k, o[k]]),
  );
const wireFields = [
  "public_key",
  "category_id",
  "slug",
  "sku",
  "translations",
  "status",
  "comparable",
  "price",
  "currency",
  "price_mode",
  "version",
  "sort_order",
  "specs",
  "provenance",
  "media",
  "created_at",
  "updated_at",
];
function decode(row) {
  if (!row) return row;
  row = { ...row };
  for (const key of [
    "translations",
    "specs",
    "provenance",
    "media",
    "source_data",
    "attributes_data",
  ])
    if (typeof row[key] === "string") row[key] = JSON.parse(row[key]);
  return row;
}
function productOut(row, category, admin = false) {
  row = decode(row);
  return {
    id: row.transport_id,
    ...pick(row, wireFields),
    category_public_key: category?.public_key || "",
    attributes: row.attributes_data || [],
    ...(admin ? { source_data: row.source_data || {} } : {}),
  };
}
function categoryOut(row) {
  row = decode(row);
  return {
    id: row.transport_id,
    ...pick(row, [
      "public_key",
      "parent_id",
      "slug",
      "translations",
      "is_published",
      "sort_order",
    ]),
  };
}
function pagination(query) {
  let page = Number(query.page || 1),
    page_size = Number(query.page_size || 20);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(page_size) ||
    page_size < 1 ||
    page_size > 100
  )
    throw new AppError("validation_error", "Invalid pagination", 422);
  return { page, page_size };
}
function search(query, text) {
  if (typeof text !== "string" || text.length > 200)
    throw new AppError("validation_error", "Invalid search", 422);
  const value = "%" + text.replace(/[\\%_]/g, "\\$&") + "%";
  return query.where(function () {
    this.whereRaw("p.public_key ILIKE ? ESCAPE '\\'", [value])
      .orWhereRaw("p.slug ILIKE ? ESCAPE '\\'", [value])
      .orWhereRaw("p.sku ILIKE ? ESCAPE '\\'", [value]);
    for (const locale of ["ru", "kk", "en", "zh", "uz"])
      this.orWhereRaw("p.translations -> ? ->> 'name' ILIKE ? ESCAPE '\\'", [
        locale,
        value,
      ]);
  });
}
function createCatalog({ db, auth, audit, authorizer, compatibilityReads = false }) {
  // Native CMS lists deliberately retain their existing validation/default 20.
  const pageFor = (ctx) => compatibilityReads
    ? requestPagination(ctx)
    : (() => { const p = pagination(ctx.query); return { ...p, offset: BigInt(p.page - 1) * BigInt(p.page_size) }; })();
  const table = (tx = db) => tx(PRODUCT);
  const categories = (tx = db) => tx(CATEGORY);
  const base = (tx = db) =>
    tx({ p: PRODUCT })
      .join({ c: CATEGORY }, "p.category_id", "c.transport_id")
      .select("p.*", "c.public_key as category_public_key");
  const publicQuery = (tx = db) =>
    base(tx).where("p.status", "published").where("c.is_published", true);
  async function manager(ctx) {
    if (authorizer) return authorizer.manager(ctx);
    const a = await auth.context(ctx);
    if (
      a.membership.role.organization_id !== null ||
      !a.permissions.has("catalog.manage")
    )
      throw new AppError(
        "permission_denied",
        "Global catalog management permission is required",
        403,
      );
    return a;
  }
  async function categoryFor(tx, id, status) {
    const row = await categories(tx).where({ transport_id: id }).first();
    if (!row)
      throw new AppError("category_not_found", "Category not found", 422);
    if (status === "published" && !row.is_published)
      throw new AppError(
        "category_not_published",
        "Publish the category before its products",
        422,
      );
    return row;
  }
  async function identity(tx, public_key, slug, exclude) {
    const aliases = [public_key, slug];
    let q = table(tx).where(function () {
      this.whereIn("public_key", aliases).orWhereIn("slug", aliases);
      for (const a of aliases.filter(isUUID)) this.orWhere("transport_id", a);
    });
    if (exclude) q = q.whereNot("transport_id", exclude);
    if (await q.first())
      throw new AppError(
        "catalog_unique_conflict",
        "Public key or slug shadows another product identity",
        409,
      );
  }
  async function writeAuthorization(tx, a) {
    if (authorizer) return authorizer.writeAuthorization(tx, a);
    const active = await assertActiveContext(tx, a, "catalog.manage");
    if (active.membership.role.organization_id !== null)
      throw new AppError(
        "permission_denied",
        "Global catalog permission required",
        403,
      );
    return active;
  }
  async function auditWrite(tx, ctx, principal, event) {
    const identity = authorizer
      ? authorizer.auditIdentity(principal)
      : {
          actor_user_id: principal.user.id,
          organization_id: principal.organization_id,
        };
    await audit(tx, ctx, {
      ...event,
      ...identity,
      event_metadata: { ...event.event_metadata, ...identity.event_metadata },
    });
  }
  async function identityLock(tx) {
    await tx.raw(
      "SELECT pg_advisory_xact_lock(hashtext('alageum.catalog.identities'))",
    );
  }
  async function list(ctx, admin = false) {
    if (admin) await manager(ctx);
    const p = pageFor(ctx);
    let q = admin ? base() : publicQuery();
    if (ctx.query.category_id) {
      q = q.where("p.category_id", v.parse(v.uuid, ctx.query.category_id));
    }
    if (ctx.query.public_key) {
      v.parse(v.key, ctx.query.public_key);
      q = q.where("p.public_key", ctx.query.public_key);
    }
    if (ctx.query.status && admin) {
      if (!["draft", "published", "hidden"].includes(ctx.query.status))
        throw new AppError("validation_error", "Invalid status", 422);
      q = q.where("p.status", ctx.query.status);
    }
    if (ctx.query.q) search(q, ctx.query.q);
    const total = Number(
      (await q.clone().clearSelect().count({ n: "p.id" }).first()).n,
    );
    const rows = p.offset >= BigInt(total) ? [] : await q
      .orderBy("p.sort_order")
      .orderBy("p.public_key")
      .limit(p.page_size)
      .offset(Number(p.offset));
    ctx.body = {
      items: rows.map((r) =>
        productOut(r, { public_key: r.category_public_key }, admin),
      ),
      page: p.page,
      page_size: p.page_size,
      total,
    };
  }
  async function categoryList(ctx, admin = false) {
    if (admin) await manager(ctx);
    const p = pageFor(ctx);
    const q = categories();
    if (!admin) q.where("is_published", true);
    const total = Number((await q.clone().count({ n: "id" }).first()).n);
    const rows = p.offset >= BigInt(total) ? [] : await q
      .orderBy("sort_order")
      .orderBy(compatibilityReads && !admin ? "transport_id" : "public_key")
      .limit(p.page_size)
      .offset(Number(p.offset));
    ctx.body = { items: rows.map(categoryOut), page: p.page, page_size: p.page_size, total };
  }
  async function get(ctx, admin = false) {
    if (admin) await manager(ctx);
    let id = ctx.params.id;
    let row;
    if (admin) {
      id = v.parse(v.uuid, id);
      row = await table().where({ transport_id: id }).first();
    } else {
      id = resolveCatalogReadId(id);
      row = await table().where({ public_key: id }).first();
      const isAlias = id !== ctx.params.id;
      if (isAlias && row?.transport_id !== importedProductId(id)) row = null;
      if (!row && !isAlias && isUUID(id))
        row = await table().where({ transport_id: id.toLowerCase() }).first();
      if (!row && !isAlias) row = await table().where({ slug: id }).first();
    }
    const category =
      row &&
      (await categories().where({ transport_id: row.category_id }).first());
    if (
      !row ||
      !category ||
      (!admin && (row.status !== "published" || !category.is_published))
    )
      throw new AppError("product_not_found", "Product not found", 404);
    ctx.body = productOut(row, category, admin);
  }
  async function unique(work) {
    try {
      return await work();
    } catch (e) {
      if (e.code === "23505")
        throw new AppError(
          "catalog_unique_conflict",
          "Public key, slug or SKU is already in use",
          409,
        );
      throw e;
    }
  }
  async function create(ctx) {
    const a = await manager(ctx);
    const data = v.parse(v.create, ctx.request.body);
    if (authorizer) nativeMedia.validateNativeMedia({ source_data: {}, media: [] }, data.media);
    ctx.body = await unique(() =>
      db.transaction(async (tx) => {
        const active = await writeAuthorization(tx, a);
        await identityLock(tx);
        const category = await categoryFor(tx, data.category_id, data.status);
        await identity(tx, data.public_key, data.slug);
        const now = new Date();
        const [row] = await table(tx)
          .insert({
            ...data,
            media: JSON.stringify(data.media),
            transport_id: randomUUID(),
            document_id: randomUUID().replaceAll("-", "").slice(0, 24),
            version: 1,
            sort_order: 0,
            source_data: {},
            attributes_data: "[]",
            created_at: now,
            updated_at: now,
            published_at: now,
          })
          .returning("*");
        await auditWrite(tx, ctx, active, {
          action: "catalog.product.create",
          entity_type: "catalog_product",
          entity_id: row.transport_id,
          event_metadata: { after: data, version: 1 },
        });
        return productOut(row, category, true);
      }),
    );
    ctx.status = 201;
  }
  async function update(ctx, action = "update") {
    const a = await manager(ctx);
    ctx.params.id = v.parse(v.uuid, ctx.params.id);
    const body = v.parse(
      action === "update" ? v.patch : v.version,
      ctx.request.body,
    );
    const changes =
      action === "hide"
        ? { status: "hidden" }
        : action === "restore"
          ? { status: "draft" }
          : Object.fromEntries(
              Object.entries(body).filter(([k]) => k !== "version"),
            );
    ctx.body = await unique(() =>
      db.transaction(async (tx) => {
        const active = await writeAuthorization(tx, a);
        await identityLock(tx);
        const row = await table(tx)
          .where({ transport_id: ctx.params.id })
          .forUpdate()
          .first();
        if (!row)
          throw new AppError("product_not_found", "Product not found", 404);
        if (row.version !== body.version)
          throw new AppError(
            "catalog_version_conflict",
            "Product changed; reload before saving",
            409,
            { current_version: row.version },
          );
        if (authorizer && Object.hasOwn(changes, "media"))
          nativeMedia.validateNativeMedia(row, changes.media);
        if (action === "restore" && row.status !== "hidden")
          throw new AppError(
            "catalog_not_hidden",
            "Only hidden products can be restored",
            409,
          );
        const data = v.parse(v.fields, {
          ...pick(decode(row), Object.keys(v.fields.shape || {})),
          ...changes,
        });
        const category = await categoryFor(tx, data.category_id, data.status);
        const beforeCategory = await categories(tx)
          .where({ transport_id: row.category_id })
          .first();
        await identity(tx, row.public_key, data.slug, row.transport_id);
        const [saved] = await table(tx)
          .where({ transport_id: row.transport_id, version: body.version })
          .update({
            ...data,
            media: JSON.stringify(data.media),
            version: body.version + 1,
            updated_at: new Date(),
          })
          .returning("*");
        if (!saved)
          throw new AppError(
            "catalog_version_conflict",
            "Product changed; reload before saving",
            409,
          );
        await auditWrite(tx, ctx, active, {
          action: `catalog.product.${action}`,
          entity_type: "catalog_product",
          entity_id: row.transport_id,
          event_metadata: {
            before: productOut(row, beforeCategory, true),
            after: productOut(saved, category, true),
            changed_fields: Object.keys(changes).sort(),
          },
        });
        return productOut(saved, category, true);
      }),
    );
  }
  async function compare(ctx) {
    const body = v.parse(
      require("zod")
        .z.object({ product_ids: require("zod").z.array(v.uuid) })
        .strict(),
      ctx.request.body,
    );
    const ids = [...new Set(body.product_ids)];
    if (ids.length < 2 || ids.length > 5)
      throw new AppError(
        "invalid_comparison",
        "Select between 2 and 5 unique products",
        422,
      );
    ctx.body = (
      await publicQuery()
        .whereIn("p.transport_id", ids)
        .where("p.comparable", true)
    ).map((r) => productOut(r, { public_key: r.category_public_key }));
  }
  async function readNativeMedia(ctx, asPreview = false) {
    if (!authorizer) throw new AppError("permission_denied", "Native CMS access required", 403);
    const a = await manager(ctx);
    const id = v.parse(v.uuid, ctx.params.id);
    await db.transaction(async tx => {
      await writeAuthorization(tx, a);
      const row = await table(tx).where({ transport_id: id }).forShare().first();
      if (!row) throw new AppError("product_not_found", "Product not found", 404);
      if (asPreview) {
        const value = nativeMedia.preview(row, ctx.params.entryId);
        ctx.set("Content-Type", value.mime);
        ctx.set("X-Content-Type-Options", "nosniff");
        ctx.set("Cache-Control", "private, no-store");
        ctx.body = value.bytes;
      } else ctx.body = nativeMedia.options(row);
    });
  }
  async function getForQuote(tx, ids) {
    const rows = await publicQuery(tx)
      .whereIn("p.transport_id", ids)
      .orderBy("p.transport_id")
      .forShare("p", "c");
    return rows.map((r) =>
      productOut(r, { public_key: r.category_public_key }),
    );
  }
  async function importRecords(records) {
    if (
      !Array.isArray(records) ||
      new Set(records.map((r) => r.id)).size !== records.length ||
      records.some((r) => !CATEGORIES[r.category])
    )
      throw new Error("Invalid catalog source");
    return unique(() =>
      db.transaction(async (tx) => {
        await identityLock(tx);
        const result = { categories_created: 0, created: 0, skipped: 0 };
        const cat = {};
        for (const [i, [key, label]] of Object.entries(CATEGORIES).filter(([key]) => !["reactors", "accessories"].includes(key) || records.some(r => r.category === key)).entries()) {
          const id = uuid5(`category:${key}`, NAMESPACE);
          let row = await categories(tx).where({ public_key: key }).first();
          if (row && row.transport_id !== id)
            throw new Error("Category identity conflict");
          if (!row) {
            const now = new Date();
            [row] = await categories(tx)
              .insert({
                transport_id: id,
                document_id: randomUUID().replaceAll("-", "").slice(0, 24),
                public_key: key,
                slug: key,
                translations: { ru: { name: label } },
                is_published: true,
                sort_order: i,
                created_at: now,
                updated_at: now,
                published_at: now,
              })
              .returning("*");
            result.categories_created++;
          }
          cat[key] = row;
        }
        for (const [i, r] of records.entries()) {
          const id = importedProductId(r.id);
          const exists = await table(tx).where({ public_key: r.id }).first();
          if (exists) {
            if (exists.transport_id !== id)
              throw new Error("Product identity conflict");
            result.skipped++;
            continue;
          }
          await identity(tx, r.id, r.id);
          const data = v.parse(v.create, {
            public_key: r.id,
            slug: r.id,
            category_id: cat[r.category].transport_id,
            sku: r.sku || null,
            translations: {
              ru: { name: r.name, description: r.description || "" },
            },
            status: "published",
            specs: pick(r, SPEC_FIELDS),
            provenance: pick(r, PROVENANCE_FIELDS),
            media: r.image
              ? [{ path: r.image, kind: "image", alt: r.imageCaption || "" }]
              : [],
          });
          const now = new Date();
          await table(tx).insert({
            ...data,
            media: JSON.stringify(data.media),
            transport_id: id,
            document_id: randomUUID().replaceAll("-", "").slice(0, 24),
            sort_order: i,
            version: 1,
            source_data: r,
            attributes_data: "[]",
            created_at: now,
            updated_at: now,
            published_at: now,
          });
          result.created++;
        }
        return result;
      }),
    );
  }
  return {
    list,
    categoryList,
    get,
    create,
    update,
    compare,
    getForQuote,
    mediaOptions: (ctx) => readNativeMedia(ctx),
    mediaPreview: (ctx) => readNativeMedia(ctx, true),
    importRecords,
  };
}
module.exports = {
  createCatalog,
  productOut,
  categoryOut,
  NAMESPACE,
  PRODUCT,
  CATEGORY,
  pagination,
};
