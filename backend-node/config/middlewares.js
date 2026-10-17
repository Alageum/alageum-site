"use strict";
const { recoverQuoteJsonScalar } = require("../src/domain/quote-body");
const { onFileBegin } = require("../src/domain/media-temporary");
module.exports = ({ env }) => [
  "global::safe-request-logger",
  "strapi::errors",
  "global::compat-metrics",
  "global::compat-errors",
  "global::request-security",
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
  "global::media-upload-temporary",
  {
    name: "strapi::body",
    config: {
      jsonLimit: "1mb",
      formLimit: "1mb",
      textLimit: "1mb",
      formidable: { maxFileSize: 1024 * 1024, maxTotalFileSize: 10 * 1024 * 1024, maxFiles: 10, allowEmptyFiles: false, onFileBegin },
      onError: recoverQuoteJsonScalar,
    },
  },
  "global::cms-admission",
  "strapi::session",
  "strapi::favicon",
  "strapi::public",
];
