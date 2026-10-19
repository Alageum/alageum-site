"use strict";
const { listNews, getNews } = require("../../../domain/news");
module.exports = ({ strapi }) => ({ findPublished: ctx => listNews(strapi, ctx), findPublishedOne: ctx => getNews(strapi, ctx) });
