"use strict";
// Additive B2B tables only. Existing seven-field metadata tables are untouched.
const definitions = {
  eds_snapshots: `id uuid PRIMARY KEY, organization_id uuid NOT NULL, document_id uuid NOT NULL,
    document_version_id uuid NOT NULL UNIQUE REFERENCES b2b.document_versions(id), file_id uuid NOT NULL,
    version integer NOT NULL CHECK (version > 0), sha256 varchar(64) NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    size_bytes integer NOT NULL CHECK (size_bytes BETWEEN 12 AND 5242880), media_type varchar(40) NOT NULL CHECK (media_type = 'application/pdf'),
    content bytea NOT NULL CHECK (octet_length(content) = size_bytes), created_at timestamptz NOT NULL,
    UNIQUE(id, organization_id), FOREIGN KEY(document_id, organization_id) REFERENCES b2b.documents(id, organization_id),
    FOREIGN KEY(file_id, organization_id) REFERENCES b2b.file_objects(id, organization_id)`,
  eds_intents: `id uuid PRIMARY KEY, organization_id uuid NOT NULL, document_id uuid NOT NULL, snapshot_id uuid NOT NULL,
    actor_user_id uuid NOT NULL REFERENCES b2b.users(id), status varchar(12) NOT NULL CHECK (status IN ('open','cancelled','submitted')),
    expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL,
    UNIQUE(id, organization_id), FOREIGN KEY(document_id, organization_id) REFERENCES b2b.documents(id, organization_id),
    FOREIGN KEY(snapshot_id, organization_id) REFERENCES b2b.eds_snapshots(id, organization_id)`,
  eds_signatures: `id uuid PRIMARY KEY, organization_id uuid NOT NULL, document_id uuid NOT NULL, snapshot_id uuid NOT NULL,
    intent_id uuid NOT NULL UNIQUE, actor_user_id uuid NOT NULL REFERENCES b2b.users(id),
    signature bytea NOT NULL CHECK (octet_length(signature) BETWEEN 1 AND 262144), signature_sha256 varchar(64) NOT NULL,
    content_sha256 varchar(64) NOT NULL, status varchar(24) NOT NULL CHECK (status IN ('pending_verification','verified','rejected')),
    reason varchar(40), provider varchar(80), created_at timestamptz NOT NULL, verified_at timestamptz,
    UNIQUE(organization_id, signature_sha256), FOREIGN KEY(document_id, organization_id) REFERENCES b2b.documents(id, organization_id),
    FOREIGN KEY(snapshot_id, organization_id) REFERENCES b2b.eds_snapshots(id, organization_id),
    FOREIGN KEY(intent_id, organization_id) REFERENCES b2b.eds_intents(id, organization_id),
    CHECK ((status = 'verified' AND verified_at IS NOT NULL AND provider IS NOT NULL AND reason IS NULL) OR (status <> 'verified' AND verified_at IS NULL AND provider IS NULL))`,
};
const columns = {
  eds_snapshots: "id organization_id document_id document_version_id file_id version sha256 size_bytes media_type content created_at",
  eds_intents: "id organization_id document_id snapshot_id actor_user_id status expires_at created_at",
  eds_signatures: "id organization_id document_id snapshot_id intent_id actor_user_id signature signature_sha256 content_sha256 status reason provider created_at verified_at",
};
const constraints = {
  eds_snapshots: ["CHECK ((version > 0))", "CHECK (((sha256)::text ~ '^[0-9a-f]{64}$'::text))", "CHECK (((size_bytes >= 12) AND (size_bytes <= 5242880)))", "CHECK (((media_type)::text = 'application/pdf'::text))", "CHECK ((octet_length(content) = size_bytes))", "PRIMARY KEY (id)", "UNIQUE (document_version_id)", "UNIQUE (id, organization_id)", "FOREIGN KEY (document_version_id) REFERENCES b2b.document_versions(id)", "FOREIGN KEY (document_id, organization_id) REFERENCES b2b.documents(id, organization_id)", "FOREIGN KEY (file_id, organization_id) REFERENCES b2b.file_objects(id, organization_id)"],
  eds_intents: ["CHECK (((status)::text = ANY ((ARRAY['open'::character varying, 'cancelled'::character varying, 'submitted'::character varying])::text[])))", "PRIMARY KEY (id)", "UNIQUE (id, organization_id)", "FOREIGN KEY (actor_user_id) REFERENCES b2b.users(id)", "FOREIGN KEY (document_id, organization_id) REFERENCES b2b.documents(id, organization_id)", "FOREIGN KEY (snapshot_id, organization_id) REFERENCES b2b.eds_snapshots(id, organization_id)"],
  eds_signatures: ["CHECK (((octet_length(signature) >= 1) AND (octet_length(signature) <= 262144)))", "CHECK (((status)::text = ANY ((ARRAY['pending_verification'::character varying, 'verified'::character varying, 'rejected'::character varying])::text[])))", "CHECK (((((status)::text = 'verified'::text) AND (verified_at IS NOT NULL) AND (provider IS NOT NULL) AND (reason IS NULL)) OR (((status)::text <> 'verified'::text) AND (verified_at IS NULL) AND (provider IS NULL))))", "PRIMARY KEY (id)", "UNIQUE (intent_id)", "UNIQUE (organization_id, signature_sha256)", "FOREIGN KEY (actor_user_id) REFERENCES b2b.users(id)", "FOREIGN KEY (document_id, organization_id) REFERENCES b2b.documents(id, organization_id)", "FOREIGN KEY (snapshot_id, organization_id) REFERENCES b2b.eds_snapshots(id, organization_id)", "FOREIGN KEY (intent_id, organization_id) REFERENCES b2b.eds_intents(id, organization_id)"],
};
function columnShape(name, column) {
  if (column === "id" || column.endsWith("_id")) return ["uuid", null, "NO"];
  if (column.endsWith("_at")) return ["timestamp with time zone", null, column === "verified_at" ? "YES" : "NO"];
  if (["content", "signature"].includes(column)) return ["bytea", null, "NO"];
  if (["version", "size_bytes"].includes(column)) return ["integer", null, "NO"];
  const lengths = { sha256: 64, signature_sha256: 64, content_sha256: 64, media_type: 40, status: name === "eds_intents" ? 12 : 24, reason: 40, provider: 80 };
  return ["character varying", lengths[column], ["reason", "provider"].includes(column) ? "YES" : "NO"];
}
const guards = {
  eds_snapshots: "RAISE EXCEPTION 'EDS snapshots are immutable';",
  eds_intents: `IF TG_OP = 'DELETE' OR OLD.status <> 'open' OR NEW.status NOT IN ('cancelled','submitted') OR
    (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN RAISE EXCEPTION 'Invalid EDS intent transition'; END IF; RETURN NEW;`,
  eds_signatures: `IF TG_OP = 'DELETE' OR OLD.status <> 'pending_verification' OR NEW.status NOT IN ('verified','rejected') OR
    (to_jsonb(NEW) - ARRAY['status','reason','provider','verified_at']) IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reason','provider','verified_at']) THEN RAISE EXCEPTION 'Invalid EDS signature transition'; END IF; RETURN NEW;`,
};
async function preflightSchema(db) {
  for (const name of Object.keys(definitions)) {
    const relation = (await db.raw("SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='b2b' AND c.relname=?", [name])).rows;
    if (!relation.length) continue;
    const bad = () => { throw new Error(`EDS schema mismatch: ${name} requires reviewed migration`); };
    if (relation.length !== 1 || relation[0].relkind !== "r" || relation[0].relrowsecurity || relation[0].relforcerowsecurity) bad();
    const actual = await db("information_schema.columns").select("column_name", "data_type", "character_maximum_length", "is_nullable", "column_default", "is_identity", "is_generated", "domain_name", "collation_name", "datetime_precision", "numeric_precision", "numeric_scale").where({ table_schema: "b2b", table_name: name }).orderBy("ordinal_position");
    if (actual.map(c => c.column_name).join(" ") !== columns[name]) bad();
    if (actual.some(c => {
      const expected = columnShape(name, c.column_name);
      return c.data_type !== expected[0] || c.character_maximum_length !== expected[1] || c.is_nullable !== expected[2] || c.column_default !== null || c.is_identity !== "NO" || c.is_generated !== "NEVER" || c.domain_name !== null || c.collation_name !== null || c.datetime_precision !== (expected[0] === "timestamp with time zone" ? 6 : null) || c.numeric_precision !== (expected[0] === "integer" ? 32 : null) || c.numeric_scale !== (expected[0] === "integer" ? 0 : null);
    })) bad();
    const actualConstraints = (await db.raw("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=?::regclass", [`b2b.${name}`])).rows.map(c => c.definition).sort();
    if (JSON.stringify(actualConstraints) !== JSON.stringify([...constraints[name]].sort())) bad();
    if ((await db.raw("SELECT 1 FROM pg_index WHERE indrelid=?::regclass AND (NOT indisvalid OR NOT indisready) UNION ALL SELECT 1 FROM pg_inherits WHERE inhrelid=?::regclass OR inhparent=?::regclass", Array(3).fill(`b2b.${name}`))).rows.length) bad();
    const triggers = (await db.raw("SELECT t.tgname,t.tgenabled,t.tgtype,t.tgqual IS NULL AS unconditional,t.tgattr::text AS columns,p.prosrc FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid WHERE t.tgrelid=?::regclass AND NOT t.tgisinternal", [`b2b.${name}`])).rows;
    if (triggers.length !== 1 || triggers[0].tgname !== `${name}_guard` || triggers[0].tgenabled !== "O" || triggers[0].tgtype !== 27 || !triggers[0].unconditional || triggers[0].columns !== "" || triggers[0].prosrc !== ` BEGIN ${guards[name]} END `) bad();
  }
}
async function ensureSchema(db) {
  await db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624143)");
    await preflightSchema(tx);
    for (const [name, sql] of Object.entries(definitions)) {
      if (await tx.schema.withSchema("b2b").hasTable(name)) continue;
      await tx.raw(`CREATE TABLE b2b.${name} (${sql})`);
      await tx.raw(`CREATE FUNCTION b2b.${name}_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${guards[name]} END $$`);
      await tx.raw(`CREATE TRIGGER ${name}_guard BEFORE UPDATE OR DELETE ON b2b.${name} FOR EACH ROW EXECUTE FUNCTION b2b.${name}_immutable()`);
    }
    await preflightSchema(tx);
  });
}
module.exports = { preflightSchema, ensureSchema };
