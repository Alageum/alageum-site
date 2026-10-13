"use strict";
// Explicitly invoked by the owned-cluster supervisor, never the ordinary unit glob.
// Real Strapi starts own the native table and key. Generic writes below are SQL
// storage probes; this file does not add an HTTP writer or bypass CMS lifecycles.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { createRequire } = require("node:module");
const [mode, appDir, evidenceDir, caseName = mode] = process.argv.slice(2);
const load = createRequire(path.join(appDir, "package.json"));
const { Client } = load("pg");
const BASE_DATABASE = "alageum_strapi_generic_quote_storage_test";
const CASE_DATABASE = "alageum_strapi_generic_quote_storage_case";
const OWNER = "native_quote_storage_owner";
const POSTGRES_MAJOR = Number(process.env.NATIVE_QUOTE_STORAGE_POSTGRES_MAJOR);
assert.ok([16, 17].includes(POSTGRES_MAJOR), "Supervisor must declare PostgreSQL 16 or 17 explicitly");
const PRODUCT = "api::product.product";
const hash = value => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
const uid = () => crypto.randomUUID();
const jsonValue = value => typeof value === "string" ? JSON.parse(value) : value;
const failure = (error, phase) => ({ phase,
  type: ["Error", "AssertionError", "TypeError", "RangeError", "SyntaxError"].includes(error?.name) ? error.name : "Error",
  ...(typeof error?.code === "string" && /^[A-Z0-9_]{1,40}$/.test(error.code) ? { code: error.code } : {}),
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const save = (name, value) => fs.writeFileSync(path.join(evidenceDir, name), JSON.stringify(value, null, 2) + "\n");
const qi = value => '"' + value.replaceAll('"', '""') + '"';
const url = new URL(process.env.DATABASE_URL);
assert.equal(process.env.APP_ENV, "test");
assert.equal(process.env.NATIVE_QUOTE_STORAGE_PROOF, "owned-loopback-only");
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "39317");
assert.equal(url.username, OWNER);
assert.equal(url.password, "");
assert.equal(url.search + url.hash, "");
assert.ok([BASE_DATABASE, CASE_DATABASE].includes(url.pathname.slice(1)));
assert.equal(load("@strapi/strapi/package.json").version, "5.56.0");
assert.match(process.version, /^v24\./);

async function connect(database = url.pathname.slice(1)) {
  const target = new URL(url);
  target.pathname = database;
  const client = new Client({ connectionString: target.href, connectionTimeoutMillis: 5000,
    statement_timeout: 10000, application_name: "native-quote-storage-proof" });
  await client.connect();
  const identity = (await client.query(`SELECT current_database() AS database, current_user AS owner,
    host(inet_server_addr()) AS host, inet_server_port() AS port,
    current_setting('server_version_num')::int AS version,
    current_setting('data_directory') AS directory,
    (SELECT system_identifier::text FROM pg_control_system()) AS system_identifier,
    (SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname=current_database()) AS database_owner`)).rows[0];
  assert.equal(identity.database, database);
  assert.equal(identity.owner, OWNER);
  assert.equal(identity.database_owner, OWNER);
  assert.equal(identity.host, "127.0.0.1");
  assert.equal(identity.port, 39317);
  assert.ok(identity.version >= POSTGRES_MAJOR * 10000 && identity.version < (POSTGRES_MAJOR + 1) * 10000);
  assert.equal(fs.realpathSync(identity.directory), fs.realpathSync(process.env.NATIVE_QUOTE_STORAGE_DIRECTORY));
  assert.equal(identity.system_identifier, process.env.NATIVE_QUOTE_STORAGE_SYSTEM_ID);
  client.proofIdentity = identity;
  return client;
}

async function catalog(client, focus = false) {
  const where = focus
    ? "(n.nspname='b2b' AND c.relname IN ('quote_requests','quote_request_items')) OR (n.nspname='public' AND c.relname='alageum_products')"
    : "n.nspname IN ('b2b','public')";
  const queries = {
    relations: `SELECT n.nspname,c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity,c.relispartition,c.relreplident,c.reloptions
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (${where}) ORDER BY 1,2`,
    columns: `SELECT n.nspname,c.relname,a.attnum,a.attname,format_type(a.atttypid,a.atttypmod) AS type,
      tn.nspname AS type_namespace,t.typname,t.typtype,a.attnotnull,a.attidentity,a.attgenerated,a.attisdropped,
      pg_get_expr(d.adbin,d.adrelid) AS expression,co.collname,a.attstorage,a.attcompression
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_type t ON t.oid=a.atttypid LEFT JOIN pg_namespace tn ON tn.oid=t.typnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum LEFT JOIN pg_collation co ON co.oid=a.attcollation
      WHERE a.attnum>0 AND (${where}) ORDER BY 1,2,3`,
    constraints: `SELECT n.nspname,c.relname,k.conname,k.contype,k.convalidated,k.condeferrable,k.condeferred,k.connoinherit,
      k.confmatchtype,k.confupdtype,k.confdeltype,k.conkey,k.confkey,k.confrelid::regclass::text AS target,
      pg_get_constraintdef(k.oid,true) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE (${where}) ORDER BY 1,2,3`,
    indexes: `SELECT n.nspname,c.relname,ic.relname AS index_name,am.amname,i.indisunique,i.indisprimary,i.indisvalid,
      i.indisready,i.indislive,i.indimmediate,i.indnullsnotdistinct,i.indnkeyatts,i.indnatts,i.indkey::text,
      pg_get_indexdef(i.indexrelid) AS definition,pg_get_expr(i.indpred,i.indrelid) AS predicate
      FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      JOIN pg_class ic ON ic.oid=i.indexrelid JOIN pg_am am ON am.oid=ic.relam
      WHERE (${where}) ORDER BY 1,2,3`,
    triggers: `SELECT n.nspname,c.relname,t.tgname,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid,true) AS definition
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (${where}) ORDER BY 1,2,3`,
    inheritance: `SELECT n.nspname,c.relname,inh.inhparent::regclass::text AS parent,inh.inhseqno
      FROM pg_inherits inh JOIN pg_class c ON c.oid=inh.inhrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE (${where}) ORDER BY 1,2,3`,
  };
  const result = {};
  for (const [name, sql] of Object.entries(queries)) result[name] = (await client.query(sql)).rows;
  return result;
}

async function allState(client) {
  const schema = await catalog(client);
  const data = [];
  for (const row of schema.relations.filter(row => row.relkind === "r")) {
    const rows = (await client.query(`SELECT to_jsonb(t)::text AS row FROM ${qi(row.nspname)}.${qi(row.relname)} t ORDER BY to_jsonb(t)::text`)).rows;
    data.push({ table: `${row.nspname}.${row.relname}`, rows: rows.length, sha256: hash(rows) });
  }
  const functions = (await client.query(`SELECT n.nspname,p.proname,pg_get_functiondef(p.oid) AS definition
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname IN ('public','b2b') AND p.prokind IN ('f','p') ORDER BY 1,2,3`)).rows;
  const sequences = (await client.query("SELECT * FROM pg_sequences WHERE schemaname IN ('public','b2b') ORDER BY schemaname,sequencename")).rows;
  const namespaces = (await client.query("SELECT nspname,pg_get_userbyid(nspowner) AS owner,nspacl FROM pg_namespace WHERE nspname !~ '^pg_' AND nspname<>'information_schema' ORDER BY nspname")).rows;
  const namespaceObjects = (await client.query(`SELECT n.nspname,d.classid::regclass::text AS catalog,
    pg_describe_object(d.classid,d.objid,d.objsubid) AS object,d.deptype
    FROM pg_depend d JOIN pg_namespace n ON d.refclassid='pg_namespace'::regclass AND d.refobjid=n.oid
    WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY 1,2,3,4`)).rows;
  const collations = (await client.query("SELECT co.* FROM pg_collation co JOIN pg_namespace n ON n.oid=co.collnamespace WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema' ORDER BY n.nspname,co.collname")).rows;
  return { schema_sha256: hash(schema), namespaces_sha256: hash(namespaces), namespace_objects_sha256: hash(namespaceObjects),
    functions_sha256: hash(functions), sequences_sha256: hash(sequences), collations, data };
}

async function spawnNative(childMode, name, database = BASE_DATABASE) {
  const target = new URL(url); target.pathname = database;
  const child = spawn(process.execPath, [__filename, childMode, appDir, evidenceDir, name], {
    cwd: appDir, env: { ...process.env, DATABASE_URL: target.href }, stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "", errors = "";
  child.stdout.on("data", data => { output += data; if (output.length > 16000) child.kill(); });
  child.stderr.on("data", data => { errors += data; if (errors.length > 16000) child.kill(); });
  const timer = setTimeout(() => child.kill(), 90000);
  const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", resolve); });
  clearTimeout(timer);
  const file = path.join(evidenceDir, `${name}-native.json`);
  assert.ok(fs.existsSync(file), `${name}: native child failed before producing evidence`);
  const report = JSON.parse(fs.readFileSync(file));
  assert.equal(code, 0, `${name}: native child failed; inspect its sanitized phase record`);
  assert.equal(report.status, "passed", name);
  return report;
}

async function oldQuoteTables(client, populated) {
  await client.query("DROP TABLE b2b.quote_request_items; DROP TABLE b2b.quote_requests");
  await client.query(`CREATE TABLE b2b.quote_requests (
    id uuid PRIMARY KEY,organization_id uuid NOT NULL REFERENCES b2b.organizations(id),created_by_id uuid NOT NULL REFERENCES b2b.users(id),
    status varchar(60) NOT NULL DEFAULT 'submitted',comment text,idempotency_key uuid NOT NULL,request_hash varchar(64) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_b2b_quote_submission UNIQUE(organization_id,created_by_id,idempotency_key),CONSTRAINT quote_status_submitted CHECK(status='submitted'));
    CREATE INDEX quote_requests_organization_id_created_by_id_created_at_index ON b2b.quote_requests(organization_id,created_by_id,created_at);
    CREATE TABLE b2b.quote_request_items(id uuid PRIMARY KEY,quote_request_id uuid NOT NULL REFERENCES b2b.quote_requests(id) ON DELETE CASCADE,
    product_id uuid NOT NULL,quantity numeric(18,3) NOT NULL,position integer NOT NULL,product_snapshot jsonb NOT NULL,
    UNIQUE(quote_request_id,product_id),UNIQUE(quote_request_id,position),
    CONSTRAINT quote_quantity_bounds CHECK(quantity>0 AND quantity<=999999999999999.999),CONSTRAINT quote_position_bounds CHECK(position>=0 AND position<100))`);
  if (populated) await client.query(`INSERT INTO b2b.quote_requests(id,organization_id,created_by_id,idempotency_key,request_hash)
    SELECT $1,o.id,u.id,$2,'old-schema-synthetic' FROM b2b.organizations o CROSS JOIN b2b.users u LIMIT 1`, [uid(), uid()]);
}

async function replaceSyntheticGeneratedExpression(client) {
  // PostgreSQL 16 has no SET EXPRESSION. Reconstruct this one cloned synthetic
  // table from its measured metadata; copy stored values entirely in PostgreSQL.
  const measured = await catalog(client, true);
  const columns = measured.columns.filter(row => row.nspname === "b2b" && row.relname === "quote_request_items");
  const constraints = measured.constraints.filter(row => row.nspname === "b2b" && row.relname === "quote_request_items");
  const indexes = measured.indexes.filter(row => row.nspname === "b2b" && row.relname === "quote_request_items" && !constraints.some(key => key.conname === row.index_name));
  assert.deepEqual(columns.filter(row => row.attgenerated).map(row => row.attname), ["generic_product_ref"]);
  const definitions = columns.map(column => `${qi(column.attname)} ${column.type}` +
    (column.attgenerated ? " GENERATED ALWAYS AS (CASE WHEN mode='generic' THEN lower(product_id::text) ELSE NULL::text END) STORED"
      : column.expression ? ` DEFAULT ${column.expression}` : "") + (column.attnotnull ? " NOT NULL" : ""));
  definitions.push(...constraints.map(key => `CONSTRAINT ${qi(key.conname)} ${key.definition}`));
  const storedColumns = columns.filter(column => !column.attgenerated).map(column => qi(column.attname)).join(",");
  await client.query("BEGIN");
  try {
    await client.query("CREATE SCHEMA proof_generated_expression; ALTER TABLE b2b.quote_request_items SET SCHEMA proof_generated_expression");
    await client.query(`CREATE TABLE b2b.quote_request_items (${definitions.join(",")})`);
    for (const index of indexes) await client.query(index.definition);
    await client.query(`INSERT INTO b2b.quote_request_items(${storedColumns}) SELECT ${storedColumns} FROM proof_generated_expression.quote_request_items`);
    await client.query("DROP TABLE proof_generated_expression.quote_request_items; DROP SCHEMA proof_generated_expression");
    await client.query("COMMIT");
  } catch (error) { await client.query("ROLLBACK"); throw error; }
}

async function supervise() {
  const result = { status: "running", scope: `Actual Strapi 5.56 startup and declared PostgreSQL ${POSTGRES_MAJOR} storage; no generic HTTP implementation`, checks: [], rejected_starts: [] };
  const write = () => save("results.json", result);
  let admin;
  let phase = "fresh-native-start";
  try {
    let client = await connect();
    try { assert.equal((await client.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','b2b')")).rows[0].n, 0); }
    finally { await client.end(); }
    const fresh = await spawnNative("fresh", "fresh");
    result.runtime = fresh.runtime;
    result.checks.push(...fresh.checks);
    result.fresh = { schema_sha256: fresh.schema_sha256, source_products: fresh.source_products, races: fresh.races };
    write();
    phase = "matching-native-restart";
    const restarted = await spawnNative("restart", "restart");
    result.checks.push(...restarted.checks);
    result.restart = { schema_sha256: restarted.schema_sha256, source_products: restarted.source_products };
    assert.equal(result.fresh.schema_sha256, result.restart.schema_sha256);
    admin = await connect("postgres");
    phase = "fresh-admission-consumption";
    await admin.query(`CREATE DATABASE ${qi(CASE_DATABASE)} TEMPLATE template0 OWNER ${qi(OWNER)}`);
    try {
      const target = new URL(url); target.pathname = CASE_DATABASE;
      const direct = load("knex")({ client: "pg", connection: target.href, pool: { min: 0, max: 2 } });
      try {
        const candidate = load(path.join(appDir, "src/domain/quote-schema.js"));
        await candidate.preflightSchema(direct);
        await assert.rejects(candidate.ensureSchema(direct), /alageum_products/);
        await assert.rejects(candidate.verifyAfterSync(direct), /missing pre-sync fresh-store admission/);
        result.checks.push({ name: "failed-ensure-consumes-private-fresh-admission", status: "passed" });
      } finally { await direct.destroy(); }
    } finally { await admin.query(`DROP DATABASE ${qi(CASE_DATABASE)}`); }
    async function dropNativeKey(client) {
      // Knex/native versions may represent a column unique as a constraint or
      // standalone index. Resolve the actual owner before removing it here.
      const constraint = (await client.query("SELECT conname FROM pg_constraint WHERE conrelid='public.alageum_products'::regclass AND conname='alageum_products_transport_id_uq'")).rows[0];
      await client.query(constraint
        ? "ALTER TABLE public.alageum_products DROP CONSTRAINT alageum_products_transport_id_uq CASCADE"
        : "DROP INDEX public.alageum_products_transport_id_uq CASCADE");
    }
    const cases = [
      ["ordinary-pgx-schema", client => client.query("CREATE SCHEMA pgx"), true],
      ["public-collation-only", client => client.query('CREATE COLLATION public.unexpected FROM pg_catalog."C"'), true],
      ["old-empty", client => oldQuoteTables(client, false)],
      ["old-populated", client => oldQuoteTables(client, true)],
      ["partial-parent-only", client => client.query("DROP TABLE b2b.quote_request_items")],
      ["partial-child-only", client => client.query("ALTER TABLE b2b.quote_request_items DROP CONSTRAINT quote_items_parent_mode_foreign; DROP TABLE b2b.quote_requests")],
      ["native-populated-no-quotes", client => client.query("DROP TABLE b2b.quote_request_items; DROP TABLE b2b.quote_requests")],
      ["native-empty-no-quotes", async client => {
        await client.query("DROP TABLE b2b.quote_request_items; DROP TABLE b2b.quote_requests");
        const relations = (await catalog(client)).relations.filter(row => row.relkind === "r");
        await client.query(`TRUNCATE ${relations.map(row => `${qi(row.nspname)}.${qi(row.relname)}`).join(",")} CASCADE`);
        for (const row of (await allState(client)).data) assert.equal(row.rows, 0);
      }],
      ["quantity-check-drift", client => client.query("ALTER TABLE b2b.quote_request_items DROP CONSTRAINT quote_quantity_bounds; ALTER TABLE b2b.quote_request_items ADD CONSTRAINT quote_quantity_bounds CHECK(quantity>=0 AND quantity<=999999999999999.999)")],
      ["column-nullability-drift", client => client.query("ALTER TABLE b2b.quote_request_items ALTER COLUMN parameters DROP NOT NULL")],
      ["missing-catalog-index", async client => {
        const index = (await catalog(client, true)).indexes.find(x => x.relname === "quote_request_items" && x.predicate && x.definition.includes("product_id"));
        assert.ok(index); await client.query(`DROP INDEX b2b.${qi(index.index_name)}`);
      }],
      ["wrong-catalog-predicate", async client => {
        const index = (await catalog(client, true)).indexes.find(x => x.relname === "quote_request_items" && x.predicate && x.definition.includes("product_id"));
        assert.ok(index); await client.query(`DROP INDEX b2b.${qi(index.index_name)}; CREATE UNIQUE INDEX ${qi(index.index_name)} ON b2b.quote_request_items(quote_request_id,product_id) WHERE mode='catalog' AND position<99`);
      }],
      ["invalid-catalog-index", async client => {
        const index = (await catalog(client, true)).indexes.find(x => x.relname === "quote_request_items" && x.predicate && x.definition.includes("product_id"));
        assert.ok(index); await client.query(`DROP INDEX b2b.${qi(index.index_name)}`);
        await assert.rejects(client.query(`CREATE UNIQUE INDEX CONCURRENTLY ${qi(index.index_name)} ON b2b.quote_request_items(position)`), error => error.code === "23505");
        assert.equal((await client.query("SELECT indisvalid FROM pg_index WHERE indexrelid=$1::regclass", [`b2b.${index.index_name}`])).rows[0].indisvalid, false);
      }],
      ["unvalidated-generic-fk", async client => {
        const fk = (await catalog(client, true)).constraints.find(x => x.relname === "quote_request_items" && x.target === "alageum_products");
        assert.ok(fk); await client.query(`ALTER TABLE b2b.quote_request_items DROP CONSTRAINT ${qi(fk.conname)}; ALTER TABLE b2b.quote_request_items ADD CONSTRAINT ${qi(fk.conname)} ${fk.definition} NOT VALID`);
      }],
      ["deferrable-generic-fk", async client => {
        const fk = (await catalog(client, true)).constraints.find(x => x.relname === "quote_request_items" && x.target === "alageum_products");
        assert.ok(fk); await client.query(`ALTER TABLE b2b.quote_request_items ALTER CONSTRAINT ${qi(fk.conname)} DEFERRABLE INITIALLY IMMEDIATE`);
      }],
      ["generic-fk-delete-action-drift", async client => {
        const fk = (await catalog(client, true)).constraints.find(x => x.relname === "quote_request_items" && x.target === "alageum_products");
        assert.ok(fk); await client.query(`ALTER TABLE b2b.quote_request_items DROP CONSTRAINT ${qi(fk.conname)}; ALTER TABLE b2b.quote_request_items ADD CONSTRAINT ${qi(fk.conname)} ${fk.definition} ON DELETE CASCADE`);
      }],
      ["disabled-item-fk-triggers", client => client.query("ALTER TABLE b2b.quote_request_items DISABLE TRIGGER ALL")],
      ["disabled-parent-fk-triggers", client => client.query("ALTER TABLE b2b.quote_requests DISABLE TRIGGER ALL")],
      ["disabled-native-fk-triggers", client => client.query("ALTER TABLE public.alageum_products DISABLE TRIGGER ALL")],
      ["wrong-generated-expression", replaceSyntheticGeneratedExpression],
      ["unexpected-trigger", async client => {
        await client.query("CREATE FUNCTION b2b.proof_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$; CREATE TRIGGER proof_trigger BEFORE INSERT ON b2b.quote_request_items FOR EACH ROW EXECUTE FUNCTION b2b.proof_trigger()");
      }],
      ["dirty-native-transport-id", async client => {
        const result = await client.query("UPDATE public.alageum_products SET transport_id='FFFFFFFF-FFFF-4FFF-8FFF-FFFFFFFFFFFF' WHERE public_key='proof-unreferenced'");
        assert.equal(result.rowCount, 1);
      }],
      ["null-native-transport-id", async client => {
        const result = await client.query("UPDATE public.alageum_products SET transport_id=NULL WHERE public_key='proof-unreferenced'");
        assert.equal(result.rowCount, 1);
      }],
      ["native-missing-key", dropNativeKey],
      ["native-partial-key", async client => {
        await dropNativeKey(client);
        await client.query("CREATE UNIQUE INDEX alageum_products_transport_id_uq ON public.alageum_products(transport_id) WHERE transport_id IS NOT NULL");
      }],
      ["native-expression-key", async client => {
        await dropNativeKey(client);
        await client.query("CREATE UNIQUE INDEX alageum_products_transport_id_uq ON public.alageum_products((lower(transport_id)))");
      }],
      ["native-wrong-key-type", async client => {
        await client.query("ALTER TABLE public.alageum_products ALTER COLUMN transport_id TYPE varchar(128)");
      }],
    ];
    for (const [name, mutate, blank = false] of cases) {
      phase = name;
      await admin.query(`CREATE DATABASE ${qi(CASE_DATABASE)} TEMPLATE ${qi(blank ? "template0" : BASE_DATABASE)} OWNER ${qi(OWNER)}`);
      try {
        client = await connect(CASE_DATABASE);
        let before;
        try { await mutate(client); before = await allState(client); }
        finally { await client.end(); }
        const rejected = await spawnNative("reject", name, CASE_DATABASE);
        client = await connect(CASE_DATABASE);
        let after;
        try { after = await allState(client); }
        finally { await client.end(); }
        assert.deepEqual(after, before, `${name}: rejected native start mutated schema or data`);
        result.rejected_starts.push({ name, status: "passed", diagnostic: rejected.rejection,
          sync_calls: rejected.sync_calls, mutating_statements: rejected.mutating_statements,
          statement_count: rejected.statements.length, unchanged_schema_and_data: true, before, after });
        write();
      } finally {
        await admin.query(`DROP DATABASE ${qi(CASE_DATABASE)}`);
      }
    }
    result.status = "passed";
  } catch (error) {
    result.status = "failed"; result.error = failure(error, phase);
    process.exitCode = 1;
  } finally {
    if (admin) await admin.end();
    write();
    process.stdout.write(JSON.stringify({ status: result.status, checks: result.checks.length, rejected_starts: result.rejected_starts.length, error: result.error || null }) + "\n");
  }
}

async function native() {
  let app, logs = "", observing = false;
  const report = { status: "running", mode, case: caseName, checks: [], races: [], statements: [], schema_observations: [], sync_calls: 0 };
  const write = () => save(`${caseName}-native.json`, report);
  const originalOut = process.stdout.write.bind(process.stdout), originalErr = process.stderr.write.bind(process.stderr);
  const capture = (chunk, encoding, callback) => {
    logs += String(chunk); if (logs.length > 4 * 1024 * 1024) throw new Error("Native log budget exceeded");
    if (typeof encoding === "function") encoding(); else callback?.(); return true;
  };
  process.stdout.write = capture; process.stderr.write = capture;
  const secrets = [];
  for (const name of ["APP_KEYS", "ADMIN_JWT_SECRET", "API_TOKEN_SALT", "TRANSFER_TOKEN_SALT", "ENCRYPTION_KEY", "ALAGEUM_JWT_SECRET"]) {
    process.env[name] = crypto.randomBytes(48).toString("hex"); secrets.push(process.env[name]);
  }
  const originalQuery = Client.prototype.query;
  Client.prototype.query = function observedQuery(...args) {
    const sql = typeof args[0] === "string" ? args[0] : args[0]?.text;
    const values = Array.isArray(args[1]) ? args[1] : args[0]?.values || [];
    const schemaQuery = observing && /^\s*select\b/i.test(sql || "") &&
      /information_schema|pg_constraint|pg_index|pg_attribute|pg_class|pg_trigger/.test(sql) &&
      (values.some(value => /^(?:b2b\.)?quote_request(?:s|_items)$|^(?:public\.)?alageum_products$/.test(String(value))) || sql.includes("'public.alageum_products'::regclass"));
    if (observing) {
      if (sql) report.statements.push(sql);
      assert.ok(report.statements.length < 10000, "Bounded native SQL capture");
    }
    const record = result => {
      if (schemaQuery && result?.rows) {
        assert.ok(report.schema_observations.length < 300, "Bounded curated schema observations");
        report.schema_observations.push({ sql, rows: result.rows });
      }
    };
    const last = args.length - 1;
    if (typeof args[last] === "function") {
      const callback = args[last];
      args[last] = function (error, result) { if (!error) record(result); return callback.apply(this, arguments); };
      return originalQuery.apply(this, args);
    }
    const returned = originalQuery.apply(this, args);
    return schemaQuery && returned?.then ? returned.then(result => { record(result); return result; }) : returned;
  };
  async function check(name, fn) {
    const item = { name, status: "running" }; report.checks.push(item); write();
    try { await fn(item); item.status = "passed"; }
    catch (error) { item.status = "failed"; item.error = failure(error, name); throw error; }
    finally { write(); }
  }
  try {
    const identityClient = await connect();
    report.runtime = { node: process.version, strapi: load("@strapi/strapi/package.json").version,
      postgres_major: POSTGRES_MAJOR, postgres_version_number: identityClient.proofIdentity.version,
      generated_drift_probe: "Changed expression on a reconstructed synthetic item table; values copied server-side, names/constraints/indexes retained" };
    await identityClient.end();
    process.chdir(appDir);
    app = load("@strapi/strapi").createStrapi({ appDir, distDir: appDir, serveAdminPanel: false });
    const sync = app.db.schema.sync;
    app.db.schema.sync = async function (...args) { report.sync_calls++; return sync.apply(this, args); };
    observing = true;
    if (mode === "reject") {
      await assert.rejects(app.load(), error => {
        const reviewedDiagnostic = /^Quote schema mismatch: [A-Za-z0-9_. -]+; requires reviewed migration before schema sync$/.test(String(error.message));
        report.rejection = reviewedDiagnostic ? error.message : "Unexpected startup failure; see sanitized error phase";
        return reviewedDiagnostic;
      });
      observing = false;
      report.mutating_statements = report.statements.filter(sql => !/^\s*(SELECT|SHOW|BEGIN|COMMIT|ROLLBACK|SET)\b/i.test(sql));
      assert.equal(report.sync_calls, 0, "Rejected start must never call native schema sync");
      assert.deepEqual(report.mutating_statements, [], "Rejected start must execute no DDL or data writes");
      assert.ok(report.statements.length > 0, "SQL observer must see actual preflight queries");
      report.status = "passed"; return;
    }
    await check("actual-native-strapi-startup", async () => { await app.load(); assert.equal(report.sync_calls, 1); });
    observing = false;
    // Successful startup SQL can contain disposable seed hashes; only SQL text
    // templates were captured. Keep counts and the relevant schema separately.
    report.startup_statement_count = report.statements.length;
    delete report.statements;
    const db = app.db.connection;
    const b2b = (name, tx = db) => tx.withSchema("b2b").table(name);
    const source = load(path.join(appDir, "src/domain/catalog-source.js")).readCatalog();
    const importedProductId = load(path.join(appDir, "src/domain/catalog-identity.js")).importedProductId;
    const products = await db("alageum_products").whereIn("public_key", source.map(x => x.id)).orderBy("public_key");
    const sourceIdentity = products.map(row => ({ public_key: row.public_key, transport_id: row.transport_id }));
    await check("reviewed-238-source-identities-and-importer", async item => {
      const reviewedRecordCount = load(path.join(appDir, "data/catalog-release.json")).recordCount;
      assert.equal(source.length, reviewedRecordCount); assert.equal(products.length, reviewedRecordCount);
      for (const row of products) assert.equal(row.transport_id, importedProductId(row.public_key));
      assert.deepEqual(await app.alageum.catalog.importRecords(source), { categories_created: 0, created: 0, skipped: source.length });
      item.count = source.length; item.sha256 = hash(sourceIdentity);
    });
    report.source_products = { count: products.length, identity_sha256: hash(sourceIdentity), rows_sha256: hash(products) };
    if (mode === "restart") {
      const fresh = JSON.parse(fs.readFileSync(path.join(evidenceDir, "fresh-native.json")));
      await check("populated-restart-preserves-catalog-and-all-quote-data", async item => {
        assert.deepEqual(report.source_products, fresh.source_products);
        const client = await connect();
        try {
          const focused = await catalog(client, true);
          report.schema_sha256 = hash(focused);
          assert.equal(report.schema_sha256, fresh.schema_sha256);
          for (const name of ["quote_requests", "quote_request_items", "audit_events"]) {
            const rows = (await client.query(`SELECT to_jsonb(t)::text AS row FROM b2b.${name} t ORDER BY to_jsonb(t)::text`)).rows;
            assert.equal(hash(rows), fresh.retained_data[name]);
          }
          item.generated_ref_fk_native_key_fingerprint_retained = true;
        } finally { await client.end(); }
      });
      report.status = "passed"; return;
    }
    const { DEMO } = load(path.join(appDir, "src/domain/auth.js"));
    const parent = (overrides = {}) => ({ id: uid(), organization_id: DEMO.organizationA, created_by_id: DEMO.users.admin,
      mode: "generic", ...overrides });
    const line = (quote, overrides = {}) => ({ id: uid(), quote_request_id: quote.id, mode: quote.mode,
      product_id: null, quantity: "1", position: 0, product_snapshot: "{}", parameters: "{}", ...overrides });
    const audit = load(path.join(appDir, "src/domain/audit.js")).audit;
    async function writeQuote(quote, lines, tx = db) {
      await b2b("quote_requests", tx).insert(quote);
      for (const value of lines) await b2b("quote_request_items", tx).insert(value);
      await audit(tx, { state: { requestId: "synthetic-native-storage-proof" } }, {
        action: "quote.create", actor_user_id: quote.created_by_id, organization_id: quote.organization_id,
        entity_type: "quote_request", entity_id: quote.id, event_metadata: {},
      });
    }
    async function expectedFailure(code, work) {
      let observed;
      await assert.rejects(work, error => { observed = error.code || error.cause?.code; return observed === code; });
      return observed;
    }
    const prototype = products[0];
    async function syntheticProduct(name, status = "published", category) {
      const row = { ...prototype, transport_id: uid(), public_key: `proof-${name}`, slug: `proof-${name}`, sku: null,
        document_id: uid().replaceAll("-", "").slice(0, 24), status, ...(category ? { category_id: category } : {}) };
      delete row.id;
      for (const key of ["media", "attributes_data"]) if (Array.isArray(row[key])) row[key] = JSON.stringify(row[key]);
      return (await db("alageum_products").insert(row).returning("*"))[0];
    }
    const synthetic = {};
    let genericReadFixture;
    await check("generic-null-repeated-all-status-and-hidden-category-storage", async item => {
      const category = { ...(await db("alageum_categories").first()), transport_id: uid(), public_key: "proof-hidden-category", slug: "proof-hidden-category",
        document_id: uid().replaceAll("-", "").slice(0, 24), is_published: false }; delete category.id;
      await db("alageum_categories").insert(category);
      for (const status of ["published", "draft", "hidden"]) synthetic[status] = await syntheticProduct(status, status, category.transport_id);
      synthetic.unreferenced = await syntheticProduct("unreferenced");
      const quote = parent();
      const quantities = ["1.000", "0.001", "999999999999999.999", "1.234", "2.000", "0.500"];
      const lines = [null, null, synthetic.published.transport_id, synthetic.published.transport_id, synthetic.draft.transport_id, synthetic.hidden.transport_id]
        .map((product_id, index) => line(quote, { product_id, quantity: quantities[index], parameters: '{"large":9007199254740993,"nested":{"__proto__":{"data":true}}}' }));
      await db.transaction(tx => writeQuote(quote, lines, tx));
      genericReadFixture = { id: quote.id, items: lines.map(value => ({ id: value.id, product_id: value.product_id,
        quantity: value.quantity, product_snapshot: {} })).sort((a, b) => a.id.localeCompare(b.id)) };
      const savedParent = await b2b("quote_requests").where({ id: quote.id }).first();
      assert.equal(savedParent.mode, "generic"); assert.equal(savedParent.status, "submitted");
      assert.equal(savedParent.idempotency_key, null); assert.equal(savedParent.request_hash, null);
      const stored = await b2b("quote_request_items").where({ quote_request_id: quote.id }).select("*", db.raw("parameters::text AS parameters_text"));
      assert.equal(stored.length, 6);
      for (const value of stored) {
        assert.equal(value.position, 0); assert.deepEqual(jsonValue(value.product_snapshot), {});
        assert.equal(value.generic_product_ref, value.product_id);
        assert.match(value.parameters_text, /9007199254740993/);
      }
      const repeated = parent(); await db.transaction(tx => writeQuote(repeated, [line(repeated)], tx));
      item.line_count = 6; item.global_statuses = ["published", "draft", "hidden"]; item.same_product_lines = 2; item.null_product_lines = 2;
    });
    await check("native-generated-write-lifecycle-denial-preserved", async item => {
      for (const method of ["update", "delete"]) await assert.rejects(app.db.query(PRODUCT)[method]({
        where: { id: synthetic.unreferenced.id }, ...(method === "update" ? { data: { transport_id: uid() } } : {}),
      }), /Native CMS catalog writes are not enabled/);
      item.methods = ["query-service update", "query-service delete"];
    });
    await check("generic-fk-parent-coupling-generated-and-shape-checks", async item => {
      const generic = parent(); await b2b("quote_requests").insert(generic);
      const cases = [
        ["unknown-product", "23503", line(generic, { product_id: uid() })],
        ["wrong-parent-mode", "23503", line(generic, { mode: "catalog", product_id: uid(), position: 1 })],
        ["nonzero-position", "23514", line(generic, { position: 1 })],
        ["nonempty-snapshot", "23514", line(generic, { product_snapshot: '{"client":true}' })],
        ["nonobject-parameters", "23514", line(generic, { parameters: "[]" })],
        ["generated-override", "428C9", line(generic, { generic_product_ref: synthetic.published.transport_id })],
      ];
      item.cases = [];
      for (const [name, code, value] of cases) { await expectedFailure(code, () => b2b("quote_request_items").insert(value)); item.cases.push({ name, code }); }
      await expectedFailure("23514", () => b2b("quote_requests").insert(parent({ idempotency_key: uid() })));
      await expectedFailure("23514", () => b2b("quote_requests").insert(parent({ request_hash: "unexpected" })));
      await expectedFailure("23514", () => b2b("quote_requests").insert(parent({ status: "draft" })));
    });
    await check("catalog-constraints-uniqueness-and-snapshot-independence", async item => {
      const quote = parent({ mode: "catalog", idempotency_key: uid(), request_hash: "catalog-storage-proof" });
      const product = await syntheticProduct("catalog-only");
      const first = line(quote, { product_id: product.transport_id, product_snapshot: '{"sku":"retained-synthetic-snapshot"}' });
      await db.transaction(tx => writeQuote(quote, [first], tx));
      const attempts = [
        ["missing-key", () => b2b("quote_requests").insert(parent({ mode: "catalog", request_hash: "hash" })), "23514"],
        ["missing-hash", () => b2b("quote_requests").insert(parent({ mode: "catalog", idempotency_key: uid() })), "23514"],
        ["duplicate-submission", () => b2b("quote_requests").insert({ ...quote, id: uid() }), "23505"],
        ["null-product", () => b2b("quote_request_items").insert(line(quote, { position: 1 })), "23514"],
        ["duplicate-product", () => b2b("quote_request_items").insert(line(quote, { product_id: product.transport_id, position: 1 })), "23505"],
        ["duplicate-position", () => b2b("quote_request_items").insert(line(quote, { product_id: uid() })), "23505"],
        ["catalog-parameters", () => b2b("quote_request_items").insert(line(quote, { product_id: uid(), position: 1, parameters: '{"x":1}' })), "23514"],
        ["position-bound", () => b2b("quote_request_items").insert(line(quote, { product_id: uid(), position: 100 })), "23514"],
      ];
      item.cases = [];
      for (const [name, work, code] of attempts) { await expectedFailure(code, work); item.cases.push({ name, code }); }
      await db("alageum_products").where({ id: product.id }).del();
      const stored = await b2b("quote_request_items").where({ id: first.id }).first();
      assert.equal(stored.generic_product_ref, null); assert.deepEqual(jsonValue(stored.product_snapshot), { sku: "retained-synthetic-snapshot" });
      const unknown = line(quote, { product_id: uid(), position: 1 }); await b2b("quote_request_items").insert(unknown);
      item.catalog_only_native_product_deletion = "allowed"; item.catalog_unknown_live_reference = "allowed";
    });
    await check("numeric-and-middle-item-atomic-failures", async item => {
      item.cases = [];
      for (const [name, quantity, code] of [["rounded-zero", "0.0001", "23514"], ["overflow", "999999999999999.9995", "22003"], ["negative", "-1", "23514"], ["nan", "NaN", "23514"], ["infinity", "Infinity", "22003"]]) {
        const quote = parent();
        await expectedFailure(code, () => db.transaction(async tx => {
          await writeQuote(quote, [line(quote)], tx);
          await b2b("quote_request_items", tx).insert(line(quote, { quantity }));
        }));
        assert.equal(await b2b("quote_requests").where({ id: quote.id }).first(), undefined);
        assert.equal(await b2b("quote_request_items").where({ quote_request_id: quote.id }).first(), undefined);
        assert.equal(await b2b("audit_events").where({ entity_id: quote.id }).first(), undefined);
        item.cases.push({ name, code, parent_items_audit_rolled_back: true });
      }
      const quote = parent();
      await expectedFailure("23503", () => db.transaction(tx => writeQuote(quote, [line(quote), line(quote, { product_id: uid() }), line(quote)], tx)));
      assert.equal(await b2b("quote_requests").where({ id: quote.id }).first(), undefined);
      assert.equal(await b2b("quote_request_items").where({ quote_request_id: quote.id }).first(), undefined);
      assert.equal(await b2b("audit_events").where({ entity_id: quote.id }).first(), undefined);
      const auditFailure = parent();
      await expectedFailure("23502", () => db.transaction(async tx => {
        await writeQuote(auditFailure, [line(auditFailure)], tx);
        await b2b("audit_events", tx).insert({ id: uid(), action: null, entity_id: auditFailure.id });
      }));
      for (const [name, predicate] of [["quote_requests", { id: auditFailure.id }], ["quote_request_items", { quote_request_id: auditFailure.id }], ["audit_events", { entity_id: auditFailure.id }]]) {
        assert.equal(await b2b(name).where(predicate).first(), undefined);
      }
      const rounding = parent(); await db.transaction(tx => writeQuote(rounding, [line(rounding, { quantity: "1.2345" })], tx));
      assert.equal((await b2b("quote_request_items").where({ quote_request_id: rounding.id }).select(db.raw("quantity::text AS quantity")).first()).quantity, "1.235");
      item.middle_unknown_product_rolled_back = true; item.audit_failure_rolled_back = true; item.scale_rounding = "1.2345 -> 1.235";
    });
    await check("generic-live-reference-restricts-native-table-and-parent-cascades", async item => {
      const product = await syntheticProduct("restrict-and-cascade"); const quote = parent();
      await db.transaction(tx => writeQuote(quote, [line(quote, { product_id: product.transport_id })], tx));
      await expectedFailure("23503", () => db("alageum_products").where({ id: product.id }).del());
      await expectedFailure("23503", () => db("alageum_products").where({ id: product.id }).update({ transport_id: uid() }));
      await b2b("quote_requests").where({ id: quote.id }).del();
      assert.equal(await b2b("quote_request_items").where({ quote_request_id: quote.id }).first(), undefined);
      assert.equal(await db("alageum_products").where({ id: product.id }).del(), 1);
      item.delete_and_key_update = "23503"; item.parent_cascade_releases_reference = true;
    });
    await check("native-created-product-table-races-both-orders-delete-and-key-update", async () => {
      const observer = await connect();
      try {
        for (const action of ["delete", "key-update"]) for (const first of ["generic-insert", "product-mutation"]) {
          const product = await syntheticProduct(`race-${action}-${first}`); const quote = parent();
          const tx1 = await db.transaction(), tx2 = await db.transaction();
          try {
            await tx1.raw("SET LOCAL statement_timeout='8s'"); await tx2.raw("SET LOCAL statement_timeout='8s'");
            const p1 = (await tx1.raw("SELECT pg_backend_pid() AS pid")).rows[0].pid;
            const p2 = (await tx2.raw("SELECT pg_backend_pid() AS pid")).rows[0].pid;
            const mutate = tx => action === "delete"
              ? tx("alageum_products").where({ id: product.id }).del()
              : tx("alageum_products").where({ id: product.id }).update({ transport_id: uid() });
            const insert = tx => writeQuote(quote, [line(quote, { product_id: product.transport_id })], tx);
            await (first === "generic-insert" ? insert(tx1) : mutate(tx1));
            let finished = false;
            const pending = Promise.resolve(first === "generic-insert" ? mutate(tx2) : insert(tx2))
              .then(value => ({ value }), error => ({ error })).finally(() => { finished = true; });
            let blocked;
            const expires = Date.now() + 5000;
            while (Date.now() < expires) {
              const row = (await observer.query("SELECT pid,state,wait_event_type,wait_event,pg_blocking_pids(pid) AS blockers FROM pg_stat_activity WHERE pid=$1", [p2])).rows[0];
              if (row?.wait_event_type === "Lock" && row.blockers.includes(p1)) { blocked = row; break; }
              assert.equal(finished, false, "Second transaction must remain pending until first commit"); await delay(25);
            }
            assert.ok(blocked, "Real lock blocking evidence is required");
            assert.equal(blocked.wait_event, "transactionid");
            await tx1.commit();
            const outcome = await pending; assert.equal(outcome.error?.code, "23503"); await tx2.rollback();
            const dangling = await db.raw("SELECT count(*)::int n FROM b2b.quote_request_items i LEFT JOIN public.alageum_products p ON p.transport_id=i.generic_product_ref WHERE i.generic_product_ref IS NOT NULL AND p.id IS NULL");
            assert.equal(dangling.rows[0].n, 0);
            report.races.push({ action, first, scope: "Knex transactions against actual Strapi-created native product table; CMS lifecycle guards remain enabled",
              blocked, second_outcome: "23503", dangling_generic_references: 0 });
          } finally { if (!tx1.isCompleted()) await tx1.rollback(); if (!tx2.isCompleted()) await tx2.rollback(); }
        }
      } finally { await observer.end(); }
    });
    await check("generic-post-route-remains-unimplemented", async item => {
      app.server.mount();
      await new Promise((resolve, reject) => { app.server.httpServer.once("error", reject); app.server.httpServer.listen(0, "127.0.0.1", resolve); });
      report.http_port = app.server.httpServer.address().port;
      const status = await new Promise((resolve, reject) => {
        const req = http.request({ hostname: "127.0.0.1", port: report.http_port, path: "/api/v1/quotes", method: "POST",
          headers: { "content-type": "application/json", "content-length": "2" } }, response => { response.resume(); response.once("end", () => resolve(response.statusCode)); });
        req.once("error", reject); req.end("{}");
      });
      assert.equal(status, 405); item.status_code = status;
    });
    await check("existing-generic-owner-list-detail-and-peer-read-boundaries", async item => {
      async function request(route, { method = "GET", body, token } = {}) {
        const bytes = body === undefined ? null : Buffer.from(JSON.stringify(body));
        return new Promise((resolve, reject) => {
          const headers = { "X-Organization-ID": DEMO.organizationA,
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...(bytes ? { "Content-Type": "application/json", "Content-Length": String(bytes.length) } : {}) };
          const req = http.request({ hostname: "127.0.0.1", port: report.http_port, path: route, method, headers }, response => {
            const chunks = []; let length = 0;
            response.on("data", chunk => { length += chunk.length; if (length > 1024 * 1024) req.destroy(new Error("HTTP evidence budget")); else chunks.push(chunk); });
            response.once("error", reject);
            response.once("end", () => {
              try { resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString()) }); }
              catch { reject(new Error("Non-JSON storage-read response")); }
            });
          });
          req.setTimeout(5000, () => req.destroy(new Error("HTTP evidence deadline")));
          req.once("error", reject); req.end(bytes);
        });
      }
      const tokens = {};
      for (const name of ["admin", "buyer"]) {
        const login = await request("/api/v1/auth/login", { method: "POST", body: { email: `${name}@demo.example`, password: "ChangeMe123!" } });
        assert.equal(login.status, 200); assert.equal(typeof login.body.access_token, "string");
        tokens[name] = login.body.access_token;
      }
      const observer = await connect();
      try {
        const before = await allState(observer);
        const detail = await request(`/api/v1/quotes/${genericReadFixture.id}`, { token: tokens.admin });
        assert.equal(detail.status, 200);
        assert.deepEqual(Object.keys(detail.body).sort(), ["id", "status", "comment", "item_count", "created_at", "items"].sort());
        assert.equal(detail.body.id, genericReadFixture.id); assert.equal(detail.body.item_count, 6);
        assert.deepEqual(detail.body.items, genericReadFixture.items);
        for (const token of [tokens.admin, tokens.buyer]) {
          const listed = await request("/api/v1/quotes?page_size=100", { token });
          assert.equal(listed.status, 200);
          const summary = listed.body.items.find(row => row.id === genericReadFixture.id);
          assert.ok(summary); assert.equal(summary.item_count, 6);
          assert.deepEqual(Object.keys(summary).sort(), ["id", "status", "comment", "item_count", "created_at"].sort());
        }
        const peerDetail = await request(`/api/v1/quotes/${genericReadFixture.id}`, { token: tokens.buyer });
        assert.equal(peerDetail.status, 404);
        const peerMine = await request("/api/v1/quotes?mine=true&page_size=100", { token: tokens.buyer });
        assert.equal(peerMine.status, 200); assert.ok(!peerMine.body.items.some(row => row.id === genericReadFixture.id));
        assert.deepEqual(await allState(observer), before, "Existing GETs must preserve all stored rows and audit events");
        item.owner_detail_status = 200; item.owner_and_peer_summary_status = 200; item.peer_detail_status = 404;
        item.exact_quantity_strings = genericReadFixture.items.map(value => value.quantity).sort();
        item.null_and_repeated_products_retained = true; item.internal_fields_excluded = true; item.rows_and_audits_unchanged = true;
      } finally { await observer.end(); }
    });
    await check("exact-schema-and-storage-evidence-before-restart", async item => {
      const client = await connect();
      try {
        const focused = await catalog(client, true); save("native-schema-fingerprint.json", focused);
        report.schema_sha256 = hash(focused); report.retained_data = {};
        for (const name of ["quote_requests", "quote_request_items", "audit_events"]) {
          const rows = (await client.query(`SELECT to_jsonb(t)::text AS row FROM b2b.${name} t ORDER BY to_jsonb(t)::text`)).rows;
          report.retained_data[name] = hash(rows);
        }
        assert.deepEqual(await db("alageum_products").whereIn("public_key", source.map(x => x.id)).orderBy("public_key"), products);
        item.schema_sha256 = report.schema_sha256;
      } finally { await client.end(); }
    });
    report.status = "passed";
  } catch (error) {
    report.status = "failed"; report.error = failure(error, report.checks.findLast(item => item.status === "failed")?.name || mode); process.exitCode = 1;
  } finally {
    observing = false;
    try { if (app) { await app.destroy(); assert.equal(app.server.httpServer.listening, false); report.app_stopped = true; } }
    catch (error) { report.cleanup_error = failure(error, "destroy-native-app"); report.status = "failed"; process.exitCode = 1; }
    Client.prototype.query = originalQuery;
    // Only lifecycle summaries are retained, not seeds, auth material, or raw app logs.
    report.native_log_bytes = Buffer.byteLength(logs);
    for (const secret of secrets) logs = logs.replaceAll(secret, "<redacted>");
    report.finished_at = new Date().toISOString(); write();
    process.stdout.write = originalOut; process.stderr.write = originalErr;
    originalOut(JSON.stringify({ case: caseName, status: report.status, checks: report.checks.length, error: report.error || null }) + "\n");
  }
}

const watchdog = setTimeout(() => { process.stderr.write("Native storage harness watchdog expired\n"); process.exit(2); }, mode === "supervise" ? 1100000 : 85000);
(mode === "supervise" ? supervise() : native()).catch(error => {
  save(`${caseName}-fatal.json`, { status: "failed", error: failure(error, "harness-entry") }); process.exitCode = 1;
}).finally(() => clearTimeout(watchdog));
