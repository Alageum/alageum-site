"use strict";
const { errors } = require("@strapi/utils");
function reject() {
  throw new errors.ForbiddenError(
    "Native CMS catalog writes are not enabled in phase 1. Use the versioned, audited catalog editor.",
  );
}
// Visibility is not authorization. Block every generated/document-service write
// path until native CMS validation, versioning and audit parity is implemented.
module.exports = {
  beforeCreate: reject,
  beforeCreateMany: reject,
  beforeUpdate: reject,
  beforeUpdateMany: reject,
  beforeDelete: reject,
  beforeDeleteMany: reject,
};
