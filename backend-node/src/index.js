"use strict";
const authModule = require("./domain/auth");
const { createBrowserSessions } = require("./domain/browser-sessions");
const { createRegistration } = require("./domain/registration");
const registrationSchema = require("./domain/registration-schema");
const federatedModule = require("./domain/federated-auth");
const federatedSchema = require("./domain/federated-schema");
const supportModule = require("./domain/support");
const ordersModule = require("./domain/orders");
const invoicesModule = require("./domain/invoices");
const documentsModule = require("./domain/documents");
const signingModule = require("./domain/document-signing");
const signingSchema = require("./domain/document-signing-schema");
const quoteModule = require("./domain/quotes");
const quoteSchema = require("./domain/quote-schema");
const { createQuoteRateLimiter } = require("./domain/quote-rate-limit");
const auditModule = require("./domain/audit");
const organizationProfileModule = require("./domain/organization-profile");
const organizationMembersModule = require("./domain/organization-members");
const { createCatalog } = require("./domain/catalog");
const catalogFiltersModule = require("./domain/catalog-filters");
const { createCmsCatalogAuthorizer } = require("./domain/cms-catalog");
const { readCatalog } = require("./domain/catalog-source");
const pageEditorial = require("./domain/page-editorial");
const systemModule = require("./domain/system");
module.exports = {
  async register({ strapi }) {
    try {
      await quoteSchema.preflightSchema(strapi.db.connection);
      await catalogFiltersModule.preflightSchema(strapi.db.connection);
      await documentsModule.preflightSchema(strapi.db.connection);
      await signingSchema.preflightSchema(strapi.db.connection);
      await invoicesModule.preflightSchema(strapi.db.connection);
      await pageEditorial.preflightPages(strapi);
      strapi.alageumMetrics = systemModule.createMetrics();
      strapi.documents.use(pageEditorial.editorialMiddleware(strapi));
    } catch (error) {
      quoteSchema.invalidateAdmission(strapi.db.connection);
      throw error;
    }
  },
  async bootstrap({ strapi }) {
    const db = strapi.db.connection,
      config = strapi.config.get("alageum");
    try {
      await quoteSchema.verifyAfterSync(db);
      await authModule.ensureSchema(db);
      await organizationProfileModule.ensureSchema(db);
      await quoteModule.ensureSchema(db);
    } catch (error) {
      quoteSchema.invalidateAdmission(db);
      throw error;
    }
    await auditModule.ensureSchema(db);
    await supportModule.ensureSchema(db);
    await ordersModule.ensureSchema(db);
    await invoicesModule.ensureSchema(db);
    await documentsModule.ensureSchema(db);
    await signingSchema.ensureSchema(db);
    await catalogFiltersModule.ensureSchema(db);
    await pageEditorial.completePageSchema(strapi);
    await federatedSchema.ensureSchema(db);
    await registrationSchema.ensureSchema(db);
    const browserSessions = createBrowserSessions({ db, config, audit: auditModule.audit });
    const federated = federatedModule.createFederatedAuth({ db, config, audit: auditModule.audit, browserSessions });
    const auth = authModule.createAuth({
      browserSessions,
      db,
      config,
      audit: auditModule.audit,
    });
    const registration = createRegistration({ db, auth, config, audit: auditModule.audit, browserSessions });
    const catalog = createCatalog({ db, auth, audit: auditModule.audit, compatibilityReads: true });
    const catalogFilters = catalogFiltersModule.createCatalogFilters({ db });
    const quotes = quoteModule.createQuotes({
      db,
      auth,
      catalog,
      audit: auditModule.audit,
    });
    // One policy instance for quote creation; a future generic adapter must use
    // this same bucket. No external quota override or reset surface is exposed.
    const quoteCreateLimit = createQuoteRateLimiter();
    const cmsCatalog = createCatalog({
      db,
      authorizer: createCmsCatalogAuthorizer({ strapi }),
      audit: auditModule.audit,
    });
    const organizationProfile = organizationProfileModule.createOrganizationProfile({ db, auth, audit: auditModule.audit });
    const organizationMembers = organizationMembersModule.createOrganizationMembers({ db, auth });
    const support = supportModule.createSupport({ db, auth, audit: auditModule.audit });
    const orders = ordersModule.createOrders({ db, auth, audit: auditModule.audit });
    const invoices = invoicesModule.createInvoices({ db, auth });
    const documents = documentsModule.createDocuments({ db, auth, audit: auditModule.audit });
    const signing = signingModule.createDocumentSigning({ db, auth, audit: auditModule.audit, enabled: config.documentSigningEnabled });
    const system = systemModule.createSystem({ db, metrics: strapi.alageumMetrics, environment: config.env });
    strapi.alageum = { auth, federated, browserSessions, registration, catalog, catalogFilters, quotes, quoteCreateLimit, cmsCatalog, organizationProfile, organizationMembers, support, orders, invoices, documents, signing, system };
    if (config.importCatalog)
      strapi.log.info(
        "Reviewed catalog import: " +
          JSON.stringify(await catalog.importRecords(readCatalog())),
      );
    await auth.seed();
    await support.seedDemo(config);
    registration.startMailWorker();
  },
  async destroy({ strapi }) {
    await strapi.alageum?.registration?.stopMailWorker();
  },
};
