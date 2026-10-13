"use strict";
const { recoverQuoteJsonScalar } = require("../src/domain/quote-body");
module.exports = ({ env }) => [
  "global::safe-request-logger",
  "strapi::errors",
  "global::compat-metrics",
  "global::compat-errors",
  "strapi::security",
  {
    name: "strapi::cors",
    config: {
      origin: env.array("CORS_ORIGINS", ["http://localhost:3000"]),
      methods: ["GET", "POST", "PATCH", "OPTIONS"],
      headers: [
        "Content-Type",
        "Authorization",
        "X-Organization-ID",
        "Idempotency-Key",
        "X-Request-ID",
      ],
      credentials: false,
    },
  },
  "strapi::poweredBy",
  "strapi::query",
  {
    name: "strapi::body",
    config: {
      jsonLimit: "1mb",
      formLimit: "1mb",
      textLimit: "1mb",
      formidable: { maxFileSize: 1024 * 1024 },
      onError: recoverQuoteJsonScalar,
    },
  },
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
