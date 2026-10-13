"use strict";
// Operator-only local CLI. Dry-run by default. Never creates passwords or verifies email.
const { randomUUID } = require("node:crypto");
const knex = require("knex");
const { table, uuid } = require("../src/domain/auth");
const { emailValue } = require("../src/domain/registration");
const { audit } = require("../src/domain/audit");
const ADMIN_PERMISSIONS = ["catalog.read", "order.read", "order.create", "document.read", "document.create", "finance.read", "quote.read", "quote.create", "ticket.read", "ticket.create", "organization.manage_users", "integration.read", "content.manage"];
function options(argv) {
  const flags = new Map();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!["--email", "--organization-id", "--organization-name", "--organization-identifier", "--mode", "--create-organization", "--route-pending", "--apply"].includes(key) || flags.has(key)) throw new Error("Invalid or duplicate argument");
    const boolean = ["--apply", "--create-organization", "--route-pending"].includes(key);
    if (!boolean && (!argv[i + 1] || argv[i + 1].startsWith("--"))) throw new Error(`Value required for ${key}`);
    flags.set(key, boolean ? true : argv[++i]);
  }
  if (flags.has("--route-pending")) {
    if ([...flags.keys()].some(key => !["--route-pending", "--organization-id", "--apply"].includes(key))) throw new Error("Routing accepts only an explicit organization ID and optional --apply");
    return { routePending: true, organizationId: uuid(flags.get("--organization-id")), apply: flags.has("--apply") };
  }
  const email = emailValue(flags.get("--email"));
  const mode = flags.get("--mode");
  if (!["organization-admin", "catalog-manager"].includes(mode)) throw new Error("Explicit --mode organization-admin or catalog-manager is required");
  const createOrganization = flags.has("--create-organization");
  if (createOrganization && (flags.has("--organization-id") || !flags.get("--organization-name") || !flags.get("--organization-identifier"))) throw new Error("Creating an organization requires its name and external identifier, without --organization-id");
  if (!createOrganization && (flags.has("--organization-name") || flags.has("--organization-identifier"))) throw new Error("Organization details require --create-organization");
  const organizationId = createOrganization ? null : uuid(flags.get("--organization-id"));
  if ((flags.get("--organization-name") || "").length > 240 || (flags.get("--organization-identifier") || "").length > 200) throw new Error("Organization details are too long");
  return { email, mode, createOrganization, organizationId, organizationName: flags.get("--organization-name"), organizationIdentifier: flags.get("--organization-identifier"), apply: flags.has("--apply") };
}
async function provision(db, args) {
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624130)");
    const user = await table(tx, "users").whereRaw("lower(trim(email)) = ?", [args.email]).forUpdate().first();
    const profile = user && await table(tx, "registration_profiles").where({ user_id: user.id }).first();
    if (!user?.is_active || !profile?.verified_at) throw new Error("An active, email-verified registered account is required. This command cannot bypass verification.");
    let org;
    if (args.createOrganization) {
      if (await table(tx, "organizations").where({ external_id: args.organizationIdentifier }).first()) throw new Error("Organization identifier already exists; use its explicit ID");
      org = { id: randomUUID(), name: args.organizationName, external_id: args.organizationIdentifier, is_active: true };
    } else org = await table(tx, "organizations").where({ id: args.organizationId, is_active: true }).forUpdate().first();
    if (!org) throw new Error("An active organization is required");
    if (!args.createOrganization && await table(tx, "memberships").where({ user_id: user.id, organization_id: org.id }).first()) throw new Error("Membership already exists; this command will not change an existing grant");
    const summary = { mode: args.mode, user_id: user.id, email: user.email, organization: { id: org.id, name: org.name, external_id: org.external_id }, creates_organization: args.createOrganization, applied: args.apply };
    if (!args.apply) return summary;
    if (args.createOrganization) await table(tx, "organizations").insert(org);
    const role = { id: randomUUID(), organization_id: args.mode === "catalog-manager" ? null : org.id, code: `${args.mode.replaceAll("-", "_")}_${randomUUID()}`, name: args.mode === "catalog-manager" ? "Platform catalog manager" : "Organization administrator", permissions: JSON.stringify(args.mode === "catalog-manager" ? ["catalog.read", "catalog.manage"] : ADMIN_PERMISSIONS) };
    await table(tx, "roles").insert(role);
    await table(tx, "memberships").insert({ id: randomUUID(), user_id: user.id, organization_id: org.id, role_id: role.id, is_active: true });
    if (args.createOrganization) {
      await table(tx, "roles").insert({ id: randomUUID(), organization_id: org.id, code: "company_member", name: "Company member", permissions: JSON.stringify(["catalog.read", "quote.read", "quote.create", "ticket.read", "ticket.create"]) });
      // Only route pending requests matching the explicitly provisioned identifier.
      await table(tx, "company_access_requests").where({ company_identifier: org.external_id, status: "pending" }).whereNull("organization_id").update({ organization_id: org.id });
    }
    await audit(tx, null, { action: "operator_provisioned", organization_id: org.id, entity_type: "role", entity_id: role.id, event_metadata: { mode: args.mode, target_user_id: user.id, local_operator_cli: true } });
    return summary;
  });
}
async function routePending(db, args) {
  return db.transaction(async tx => {
    await tx.raw("SELECT pg_advisory_xact_lock(731624130)");
    const org = await table(tx, "organizations").where({ id: args.organizationId, is_active: true }).forShare().first();
    if (!org?.external_id) throw new Error("An active organization with an exact external identifier is required");
    const matching = () => table(tx, "company_access_requests").where({ company_identifier: org.external_id, status: "pending" }).whereNull("organization_id");
    const requests = await matching().select("id").forUpdate();
    if (args.apply) {
      await matching().update({ organization_id: org.id });
      await audit(tx, null, { action: "company_requests_routed", organization_id: org.id, event_metadata: { count: requests.length, local_operator_cli: true } });
    }
    return { mode: "route-pending", organization: { id: org.id, name: org.name, external_id: org.external_id }, request_ids: requests.map(row => row.id), applied: args.apply };
  });
}
async function main() {
  if (!["development", "test"].includes(process.env.APP_ENV)) throw new Error("Explicit APP_ENV=development or test is required; production guard remains in place");
  const connection = process.env.ALAGEUM_OPERATOR_DATABASE_URL;
  if (!connection) throw new Error("ALAGEUM_OPERATOR_DATABASE_URL must identify the local database");
  const url = new URL(connection);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) throw new Error("This operator command only supports a local loopback PostgreSQL database");
  const args = options(process.argv.slice(2)), db = knex({ client: "pg", connection });
  try { console.log(JSON.stringify(await (args.routePending ? routePending(db, args) : provision(db, args)), null, 2)); }
  finally { await db.destroy(); }
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { options, provision, routePending, ADMIN_PERMISSIONS };
