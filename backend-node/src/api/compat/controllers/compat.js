"use strict";
const { quoteClientKey } = require("../../../domain/quote-rate-limit");
const { privateResponse } = require("../../../domain/auth");
module.exports = ({ strapi }) => ({
  health: (ctx) => strapi.alageum.system.health(ctx),
  readiness: (ctx) => strapi.alageum.system.readiness(ctx),
  metrics: (ctx) => strapi.alageum.system.metrics(ctx),
  version: (ctx) => strapi.alageum.system.version(ctx),
  authProviders: (ctx) => strapi.alageum.federated.providers(ctx),
  googlePrepare: (ctx) => strapi.alageum.federated.prepare(ctx),
  googleStart: (ctx) => strapi.alageum.federated.start(ctx),
  googleCancel: (ctx) => strapi.alageum.federated.cancel(ctx),
  googleCallback: (ctx) => strapi.alageum.federated.callback(ctx),
  browserSession: (ctx) => strapi.alageum.federated.session(ctx),
  browserLogout: (ctx) => strapi.alageum.federated.logout(ctx),
  login: (ctx) => strapi.alageum.auth.login(ctx),
  refresh: (ctx) => strapi.alageum.auth.refresh(ctx),
  logout: (ctx) => strapi.alageum.auth.logout(ctx),
  me: (ctx) => strapi.alageum.auth.me(ctx),
  organizations: (ctx) => strapi.alageum.auth.organizations(ctx),
  organizationMembers: (ctx) => strapi.alageum.organizationMembers.list(ctx),
  organizationProfile: (ctx) => strapi.alageum.organizationProfile.get(ctx),
  updateOrganizationProfile: (ctx) => strapi.alageum.organizationProfile.update(ctx),
  categories: (ctx) => strapi.alageum.catalog.categoryList(ctx),
  products: (ctx) => strapi.alageum.catalog.list(ctx),
  product: (ctx) => strapi.alageum.catalog.get(ctx),
  compare: (ctx) => strapi.alageum.catalog.compare(ctx),
  filters: (ctx) => strapi.alageum.catalogFilters.list(ctx),
  adminCategories: (ctx) => strapi.alageum.catalog.categoryList(ctx, true),
  adminProducts: (ctx) => strapi.alageum.catalog.list(ctx, true),
  adminProduct: (ctx) => strapi.alageum.catalog.get(ctx, true),
  createProduct: (ctx) => strapi.alageum.catalog.create(ctx),
  updateProduct: (ctx) => strapi.alageum.catalog.update(ctx),
  hideProduct: (ctx) => strapi.alageum.catalog.update(ctx, "hide"),
  restoreProduct: (ctx) => strapi.alageum.catalog.update(ctx, "restore"),
  ticketCategories: (ctx) => strapi.alageum.support.categories(ctx),
  tickets: (ctx) => strapi.alageum.support.list(ctx),
  createTicket: (ctx) => strapi.alageum.support.create(ctx),
  orders: (ctx) => strapi.alageum.orders.list(ctx),
  order: (ctx) => strapi.alageum.orders.detail(ctx),
  invoices: (ctx) => strapi.alageum.invoices.list(ctx),
  documents: (ctx) => strapi.alageum.documents.list(ctx),
  document: (ctx) => strapi.alageum.documents.detail(ctx),
  documentSigningStatus: (ctx) => strapi.alageum.signing.status(ctx),
  prepareDocumentSigning: (ctx) => strapi.alageum.signing.prepare(ctx),
  submitDocumentSignature: (ctx) => strapi.alageum.signing.submit(ctx),
  cancelDocumentSigning: (ctx) => strapi.alageum.signing.cancel(ctx),
  recheckDocumentSignature: (ctx) => strapi.alageum.signing.recheck(ctx),
  createQuote: (ctx) => {
    privateResponse(ctx);
    // Strapi has decoded JSON before controller dispatch. Charge an accepted
    // attempt before the domain service authenticates or validates its input.
    strapi.alageum.quoteCreateLimit(quoteClientKey(ctx));
    return strapi.alageum.quotes.create(ctx);
  },
  quotes: (ctx) => strapi.alageum.quotes.list(ctx),
  quote: (ctx) => strapi.alageum.quotes.detail(ctx),
});
