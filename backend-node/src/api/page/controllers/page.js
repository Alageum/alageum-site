"use strict";
const { getPage } = require("../../../domain/pages");
module.exports = ({ strapi }) => ({ findPublished: ctx => getPage(strapi, ctx) });
