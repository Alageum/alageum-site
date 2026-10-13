"use strict";
const { required } = require("../src/domain/config-secrets");
module.exports = ({ env }) => ({
  host: env("HOST", "127.0.0.1"),
  port: env.int("PORT", 8000),
  app: { keys: required(env, "APP_KEYS").split(",") },
  proxy: { koa: false },
  logger: { updates: { enabled: false } },
});
