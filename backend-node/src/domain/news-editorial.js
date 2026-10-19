"use strict";
const { editorialMiddleware: createEditorialMiddleware } = require("./page-editorial");
const { UID, FIELDS, POPULATE, validateNews, validatePersisted } = require("./news");
// Reuse the audited transaction, fresh native session/grant locks, field-level
// permissions and native draft/publish semantics. Business JWTs never authorize writes.
function editorialMiddleware(strapi, recordAudit) {
  return createEditorialMiddleware(strapi, recordAudit, { uid: UID, fields: FIELDS, entity: "news", validate: validateNews, validatePersisted, populate: POPULATE });
}
module.exports = { editorialMiddleware };
