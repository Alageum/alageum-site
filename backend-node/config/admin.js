"use strict";
const { required } = require("../src/domain/config-secrets");
module.exports = ({ env }) => ({
  url: "/cms",
  auth: {
    secret: required(env, "ADMIN_JWT_SECRET"),
    // Pinned Strapi 5.56 serves UI at /cms but auth APIs at /admin. The native
    // access cookie must be readable at /cms and refresh cookie sent to /admin.
    // Keep host-only scope; use a dedicated CMS/backend origin for deployment.
    // Leave secure unset: native production HTTPS policy is preserved.
    cookie: { path: "/", sameSite: "lax" },
  },
  apiToken: { salt: required(env, "API_TOKEN_SALT") },
  transfer: { token: { salt: required(env, "TRANSFER_TOKEN_SALT") } },
  secrets: { encryptionKey: required(env, "ENCRYPTION_KEY") },
  flags: { nps: false, promoteEE: false },
});
