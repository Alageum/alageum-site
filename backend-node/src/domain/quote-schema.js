"use strict";

// This is a fresh-store contract, not a migration. The admission is acquired
// before Strapi sync on a wholly empty database and cannot be supplied by a
// caller, persisted as a flag, or inferred from existing quote contents.
const freshAdmissions = new WeakMap();
const TABLES = ["quote_requests", "quote_request_items"];
const PRODUCT = "alageum_products";
// Pinned Strapi 5.56 identifiers.getUniqueIndexName uses the _uq suffix.
const PRODUCT_KEY = "alageum_products_transport_id_uq";
const columnFields = ["column_name", "data_type", "is_nullable", "character_maximum_length", "numeric_precision", "numeric_scale", "column_default", "datetime_precision", "collation_name", "is_identity", "is_generated", "generation_expression", "domain_name", "domain_schema"];
const stamp = ["timestamp with time zone", "NO", null, null, null, "now()"];
const shape = {
  quote_requests: {
    id: ["uuid", "NO"], organization_id: ["uuid", "NO"], created_by_id: ["uuid", "NO"],
    mode: ["character varying", "NO", 7], status: ["character varying", "NO", 60, null, null, "'submitted'::character varying"],
    comment: ["text", "YES"], idempotency_key: ["uuid", "YES"], request_hash: ["character varying", "YES", 64],
    created_at: stamp, updated_at: stamp,
  },
  quote_request_items: {
    id: ["uuid", "NO"], quote_request_id: ["uuid", "NO"], mode: ["character varying", "NO", 7],
    product_id: ["uuid", "YES"], quantity: ["numeric", "NO", null, 18, 3], position: ["integer", "NO", null, 32, 0],
    product_snapshot: ["jsonb", "NO"], parameters: ["jsonb", "NO"], generic_product_ref: ["character varying", "YES", 255],
  },
};
const generated = "CASE WHEN ((mode)::text = 'generic'::text) THEN (product_id)::text ELSE NULL::text END";
const constraints = {
  quote_requests: {
    quote_requests_pkey: "PRIMARY KEY (id)",
    quote_requests_organization_id_foreign: "FOREIGN KEY (organization_id) REFERENCES b2b.organizations(id)",
    quote_requests_created_by_id_foreign: "FOREIGN KEY (created_by_id) REFERENCES b2b.users(id)",
    uq_b2b_quote_submission: "UNIQUE (organization_id, created_by_id, idempotency_key)",
    uq_b2b_quote_id_mode: "UNIQUE (id, mode)",
    quote_status_submitted: "CHECK (((status)::text = 'submitted'::text))",
    quote_mode: "CHECK ((((mode)::text = 'catalog'::text) OR ((mode)::text = 'generic'::text)))",
    quote_submission_mode: "CHECK (((((mode)::text = 'catalog'::text) AND (idempotency_key IS NOT NULL) AND (request_hash IS NOT NULL)) OR (((mode)::text = 'generic'::text) AND (idempotency_key IS NULL) AND (request_hash IS NULL))))",
  },
  quote_request_items: {
    quote_request_items_pkey: "PRIMARY KEY (id)",
    quote_items_parent_mode_foreign: "FOREIGN KEY (quote_request_id, mode) REFERENCES b2b.quote_requests(id, mode) ON DELETE CASCADE",
    quote_items_generic_product_foreign: "FOREIGN KEY (generic_product_ref) REFERENCES alageum_products(transport_id)",
    quote_item_mode: "CHECK ((((mode)::text = 'catalog'::text) OR ((mode)::text = 'generic'::text)))",
    quote_catalog_product: "CHECK ((((mode)::text <> 'catalog'::text) OR (product_id IS NOT NULL)))",
    quote_parameters_object: "CHECK ((jsonb_typeof(parameters) = 'object'::text))",
    quote_catalog_parameters: "CHECK ((((mode)::text <> 'catalog'::text) OR (parameters = '{}'::jsonb)))",
    quote_generic_defaults: "CHECK ((((mode)::text <> 'generic'::text) OR ((\"position\" = 0) AND (product_snapshot = '{}'::jsonb))))",
    quote_quantity_bounds: "CHECK (((quantity > (0)::numeric) AND (quantity <= 999999999999999.999)))",
    quote_position_bounds: "CHECK (((\"position\" >= 0) AND (\"position\" < 100)))",
  },
};
const indexes = {
  quote_requests: {
    quote_requests_pkey: "UNIQUE USING btree (id)",
    uq_b2b_quote_submission: "UNIQUE USING btree (organization_id, created_by_id, idempotency_key)",
    uq_b2b_quote_id_mode: "UNIQUE USING btree (id, mode)",
    quote_requests_organization_id_created_by_id_created_at_index: "USING btree (organization_id, created_by_id, created_at)",
  },
  quote_request_items: {
    quote_request_items_pkey: "UNIQUE USING btree (id)",
    uq_b2b_quote_catalog_product: "UNIQUE USING btree (quote_request_id, product_id) WHERE ((mode)::text = 'catalog'::text)",
    uq_b2b_quote_catalog_position: "UNIQUE USING btree (quote_request_id, \"position\") WHERE ((mode)::text = 'catalog'::text)",
    ix_b2b_quote_items_order: "USING btree (quote_request_id, \"position\", id)",
    ix_b2b_quote_generic_product_ref: "USING btree (generic_product_ref) WHERE (generic_product_ref IS NOT NULL)",
  },
};
const foreignTargets = {
  quote_requests_organization_id_foreign: ["b2b", "organizations", "s", "a", "a"],
  quote_requests_created_by_id_foreign: ["b2b", "users", "s", "a", "a"],
  quote_items_parent_mode_foreign: ["b2b", "quote_requests", "s", "a", "c"],
  quote_items_generic_product_foreign: ["public", PRODUCT, "s", "a", "a"],
};
const normalize = value => value == null ? null : value.replace(/\s+/g, " ").trim();
function mismatch(reason) { throw new Error(`Quote schema mismatch: ${reason}; requires reviewed migration before schema sync`); }
async function relation(db, schema, name) {
  return (await db.raw("SELECT c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relreplident FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=? AND c.relname=?", [schema, name])).rows;
}
function ordinary(rows, name) {
  if (rows.length !== 1 || rows[0].relkind !== "r" || rows[0].relpersistence !== "p" || rows[0].relrowsecurity || rows[0].relforcerowsecurity || rows[0].relispartition || rows[0].relreplident !== "d") mismatch(name);
}
function columnMatches(column, spec, expression = null) {
  return spec && column.data_type === spec[0] && column.is_nullable === spec[1] &&
    column.character_maximum_length === (spec[2] ?? null) && column.numeric_precision === (spec[3] ?? null) &&
    column.numeric_scale === (spec[4] ?? null) && column.column_default === (spec[5] ?? null) &&
    column.datetime_precision === (spec[0] === "timestamp with time zone" ? 6 : null) && column.collation_name === null &&
    column.is_identity === "NO" && column.is_generated === (expression ? "ALWAYS" : "NEVER") &&
    normalize(column.generation_expression) === expression && column.domain_name === null && column.domain_schema === null;
}
async function verifyRelationExtras(db, name) {
  const rows = (await db.raw(`SELECT 1 FROM pg_trigger WHERE tgrelid=?::regclass AND (NOT tgisinternal OR tgenabled<>'O')
    UNION ALL SELECT 1 FROM pg_inherits WHERE inhrelid=?::regclass OR inhparent=?::regclass
    UNION ALL SELECT 1 FROM pg_rewrite WHERE ev_class=?::regclass
    UNION ALL SELECT 1 FROM pg_attribute WHERE attrelid=?::regclass AND attnum>0 AND attisdropped`, Array(5).fill(name))).rows;
  if (rows.length) mismatch(`${name} custom behavior`);
}
async function productReference(db) {
  ordinary(await relation(db, "public", PRODUCT), PRODUCT);
  await verifyRelationExtras(db, `public.${PRODUCT}`);
  const column = await db("information_schema.columns").select(columnFields).where({ table_schema: "public", table_name: PRODUCT, column_name: "transport_id" }).first();
  // Native Strapi required:true is application validation, not SQL NOT NULL.
  if (!columnMatches(column || {}, ["character varying", "YES", 255])) mismatch(`${PRODUCT}.transport_id`);
  const candidates = (await db.raw(`SELECT ci.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,
      i.indisunique,i.indisvalid,i.indisready,i.indimmediate,i.indislive,i.indnullsnotdistinct
    FROM pg_index i JOIN pg_class ci ON ci.oid=i.indexrelid
    JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attname='transport_id'
    WHERE i.indrelid='public.alageum_products'::regclass AND (ci.relname=? OR a.attnum=ANY(i.indkey)
      OR EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_class'::regclass AND d.objid=i.indexrelid
        AND d.refclassid='pg_class'::regclass AND d.refobjid=i.indrelid AND d.refobjsubid=a.attnum))`, [PRODUCT_KEY])).rows;
  if (candidates.length !== 1 || candidates[0].name !== PRODUCT_KEY || !candidates[0].indisunique ||
      !candidates[0].indisvalid || !candidates[0].indisready || !candidates[0].indimmediate || !candidates[0].indislive || candidates[0].indnullsnotdistinct ||
      candidates[0].definition.replace(/^CREATE UNIQUE INDEX \S+ ON (?:public\.)?alageum_products /, "") !== "USING btree (transport_id)") mismatch(`${PRODUCT} native unique key`);
  if (await db.withSchema("public").table(PRODUCT).whereNull("transport_id")
    .orWhereRaw("transport_id !~ ?", ["^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"]).first("id")) mismatch(`${PRODUCT} stable identities`);
  if (await db.withSchema("public").table(PRODUCT).select("transport_id").groupBy("transport_id").havingRaw("count(*)>1").first()) mismatch(`${PRODUCT} duplicate identities`);
}
async function verifyTable(db, name) {
  ordinary(await relation(db, "b2b", name), name);
  await verifyRelationExtras(db, `b2b.${name}`);
  const columns = await db("information_schema.columns").select(columnFields).where({ table_schema: "b2b", table_name: name });
  if (columns.length !== Object.keys(shape[name]).length || columns.some(column => !columnMatches(column, shape[name][column.column_name], column.column_name === "generic_product_ref" ? generated : null))) mismatch(`${name} columns`);
  const keys = (await db.raw(`SELECT k.conname,k.contype,pg_get_constraintdef(k.oid) AS definition,k.convalidated,k.condeferrable,k.condeferred,k.conislocal,k.coninhcount,
      n.nspname AS target_schema,c.relname AS target_table,k.confmatchtype,k.confupdtype,k.confdeltype
    FROM pg_constraint k LEFT JOIN pg_class c ON c.oid=k.confrelid LEFT JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE k.conrelid=?::regclass`, [`b2b.${name}`])).rows;
  if (keys.length !== Object.keys(constraints[name]).length || keys.some(key => !key.convalidated || key.condeferrable || key.condeferred || !key.conislocal || key.coninhcount !== 0 ||
      normalize(key.definition.replace("REFERENCES public.alageum_products", "REFERENCES alageum_products")) !== constraints[name][key.conname] ||
      (key.contype === "f" && JSON.stringify([key.target_schema, key.target_table, key.confmatchtype, key.confupdtype, key.confdeltype]) !== JSON.stringify(foreignTargets[key.conname])))) mismatch(`${name} constraints`);
  const actualIndexes = (await db.raw(`SELECT c.relname AS name,pg_get_indexdef(i.indexrelid) AS definition,i.indisvalid,i.indisready,i.indimmediate,i.indislive,i.indnullsnotdistinct
    FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid WHERE i.indrelid=?::regclass`, [`b2b.${name}`])).rows;
  if (actualIndexes.length !== Object.keys(indexes[name]).length || actualIndexes.some(index => !index.indisvalid || !index.indisready || !index.indimmediate || !index.indislive || index.indnullsnotdistinct ||
      normalize(index.definition.replace(new RegExp(`^CREATE (UNIQUE )?INDEX \\S+ ON b2b\\.${name} `), "$1")) !== indexes[name][index.name])) mismatch(`${name} indexes`);
}
async function quoteRelations(db) { return Promise.all(TABLES.map(name => relation(db, "b2b", name))); }
async function databaseIdentity(db) {
  const row = (await db.raw(`SELECT current_database() AS name,(SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
    inet_server_addr()::text AS address,inet_server_port() AS port,pg_postmaster_start_time()::text AS started`)).rows[0];
  return JSON.stringify(row);
}
function invalidateAdmission(db) { freshAdmissions.delete(db); }
async function verifySchema(db) {
  await productReference(db);
  for (const name of TABLES) await verifyTable(db, name);
}
async function preflightSchema(db) {
  freshAdmissions.delete(db);
  const present = await quoteRelations(db);
  if (present.some(rows => rows.length)) {
    if (!present.every(rows => rows.length === 1)) mismatch("partial quote store");
    await verifySchema(db);
    return;
  }
  // Missing quotes never licenses an upgrade to an existing native/app store,
  // even if all its tables happen to be empty. Empty custom schemas also refuse.
  const objects = (await db.raw(`SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('public','information_schema') AND nspname !~ '^pg_'
    UNION ALL SELECT 1 FROM pg_depend WHERE refclassid='pg_namespace'::regclass AND refobjid='public'::regnamespace`)).rows;
  if (objects.length) mismatch("existing store without candidate quote schema");
  freshAdmissions.set(db, await databaseIdentity(db));
}
async function verifyFreshAfterSync(db, admitted) {
  if (!admitted) mismatch("missing pre-sync fresh-store admission");
  if (await databaseIdentity(db) !== admitted) mismatch("fresh-store database identity changed");
  await productReference(db);
  // Native metadata may now exist, but no business row may have arrived during
  // the initial sync. The Page marker is the sole initial b2b metadata writer.
  const tables = (await db.raw(`SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname='b2b' AND c.relname<>'editorial_page_schema' OR n.nspname='public' AND c.relname LIKE 'alageum_%') AND c.relkind IN ('r','p','v','m','f')`)).rows;
  for (const table of tables) {
    if (table.relkind !== "r" || await db.withSchema(table.nspname).table(table.relname).first()) mismatch("business data appeared during fresh startup");
  }
}
async function verifyAfterSync(db) {
  try {
    const present = await quoteRelations(db);
    if (present.some(rows => rows.length)) return await verifySchema(db);
    await verifyFreshAfterSync(db, freshAdmissions.get(db));
  } catch (error) { invalidateAdmission(db); throw error; }
}
async function ensureSchema(db) {
  const admitted = freshAdmissions.get(db);
  // Consume before any awaited work. A failed attempt never licenses repair.
  invalidateAdmission(db);
  try {
    await db.transaction(async tx => {
      await tx.raw("SELECT pg_advisory_xact_lock(731624112)");
      const present = await quoteRelations(tx);
      if (present.some(rows => rows.length)) { await verifySchema(tx); return; }
      await verifyFreshAfterSync(tx, admitted);
      await tx.raw(`CREATE TABLE b2b.quote_requests (
        id uuid PRIMARY KEY, organization_id uuid NOT NULL CONSTRAINT quote_requests_organization_id_foreign REFERENCES b2b.organizations(id),
        created_by_id uuid NOT NULL CONSTRAINT quote_requests_created_by_id_foreign REFERENCES b2b.users(id),
        mode varchar(7) NOT NULL, status varchar(60) NOT NULL DEFAULT 'submitted', comment text,
        idempotency_key uuid, request_hash varchar(64), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_b2b_quote_submission UNIQUE(organization_id,created_by_id,idempotency_key), CONSTRAINT uq_b2b_quote_id_mode UNIQUE(id,mode),
        CONSTRAINT quote_status_submitted CHECK(status='submitted'), CONSTRAINT quote_mode CHECK(mode='catalog' OR mode='generic'),
        CONSTRAINT quote_submission_mode CHECK((mode='catalog' AND idempotency_key IS NOT NULL AND request_hash IS NOT NULL) OR (mode='generic' AND idempotency_key IS NULL AND request_hash IS NULL)))`);
      await tx.raw("CREATE INDEX quote_requests_organization_id_created_by_id_created_at_index ON b2b.quote_requests(organization_id,created_by_id,created_at)");
      await tx.raw(`CREATE TABLE b2b.quote_request_items (
        id uuid PRIMARY KEY, quote_request_id uuid NOT NULL, mode varchar(7) NOT NULL, product_id uuid,
        quantity numeric(18,3) NOT NULL, position integer NOT NULL, product_snapshot jsonb NOT NULL, parameters jsonb NOT NULL,
        generic_product_ref varchar(255) GENERATED ALWAYS AS (CASE WHEN mode='generic' THEN product_id::text ELSE NULL::text END) STORED,
        CONSTRAINT quote_items_parent_mode_foreign FOREIGN KEY(quote_request_id,mode) REFERENCES b2b.quote_requests(id,mode) ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT quote_items_generic_product_foreign FOREIGN KEY(generic_product_ref) REFERENCES public.alageum_products(transport_id) ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT quote_item_mode CHECK(mode='catalog' OR mode='generic'), CONSTRAINT quote_catalog_product CHECK(mode<>'catalog' OR product_id IS NOT NULL),
        CONSTRAINT quote_parameters_object CHECK(jsonb_typeof(parameters)='object'), CONSTRAINT quote_catalog_parameters CHECK(mode<>'catalog' OR parameters='{}'::jsonb),
        CONSTRAINT quote_generic_defaults CHECK(mode<>'generic' OR (position=0 AND product_snapshot='{}'::jsonb)),
        CONSTRAINT quote_quantity_bounds CHECK(quantity>0 AND quantity<=999999999999999.999), CONSTRAINT quote_position_bounds CHECK(position>=0 AND position<100))`);
      await tx.raw("CREATE UNIQUE INDEX uq_b2b_quote_catalog_product ON b2b.quote_request_items(quote_request_id,product_id) WHERE mode='catalog'");
      await tx.raw("CREATE UNIQUE INDEX uq_b2b_quote_catalog_position ON b2b.quote_request_items(quote_request_id,position) WHERE mode='catalog'");
      await tx.raw("CREATE INDEX ix_b2b_quote_items_order ON b2b.quote_request_items(quote_request_id,position,id)");
      await tx.raw("CREATE INDEX ix_b2b_quote_generic_product_ref ON b2b.quote_request_items(generic_product_ref) WHERE generic_product_ref IS NOT NULL");
      await verifySchema(tx);
    });
  } finally { freshAdmissions.delete(db); }
}
module.exports = { preflightSchema, verifyAfterSync, verifySchema, ensureSchema, invalidateAdmission };
