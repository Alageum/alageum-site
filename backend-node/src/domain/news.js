"use strict";
const { AppError } = require("./errors");
const { LOCALES, slugValid, validatePage } = require("./pages");
const UID = "api::news-article.news-article";
const FIELDS = ["slug", "title", "locale_code", "body", "seo_title", "seo_description", "summary", "topic", "publication_date", "cover", "cover_alt"];
const MEDIA_FIELDS = ["url", "mime", "width", "height", "provider"];
const POPULATE = { cover: { fields: MEDIA_FIELDS } };
function validateNews(data) {
  validatePage(data);
  if (typeof data.summary !== "string" || !data.summary.trim() || data.summary.length > 1200) throw new Error("News summary is required (up to 1200 characters)");
  for (const [field, max] of [["topic", 120], ["cover_alt", 300]]) if (data[field] != null && (typeof data[field] !== "string" || data[field].length > max)) throw new Error(`Invalid News ${field}`);
  const date = data.publication_date;
  if (date != null && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error("Invalid News publication date");
  return data;
}
function coverDto(cover, alt) {
  if (cover == null) return null;
  if (!cover || typeof cover !== "object" || cover.provider !== "local" ||
      !["image/png", "image/jpeg", "image/webp"].includes(cover.mime) ||
      typeof cover.url !== "string" || !/^\/uploads\/[\p{L}\p{N}_-]+\.(?:png|jpe?g|webp)$/u.test(cover.url) ||
      !Number.isSafeInteger(cover.width) || cover.width < 1 || !Number.isSafeInteger(cover.height) || cover.height < 1 || cover.width * cover.height > 16 * 1024 * 1024) throw new Error("News cover must be an admitted Media Library PNG, JPEG or WebP image");
  return { url: cover.url, alt: alt || "", width: cover.width, height: cover.height };
}
function validatePersisted(data) { validateNews(data); coverDto(data.cover, data.cover_alt); }
function requestOptions(ctx, detail = false) {
  if (ctx.method !== "GET") throw new AppError("news_not_found", "News not found", 404);
  const query = new URLSearchParams(ctx.querystring || ""), allowed = detail ? ["locale"] : ["locale", "page", "page_size"];
  if ([...query.keys()].some(key => !allowed.includes(key)) || allowed.some(key => query.getAll(key).length > 1)) throw new AppError("validation_error", "Only exact News locale and pagination parameters are accepted", 400);
  const locale = query.get("locale") ?? "ru";
  if (!LOCALES.has(locale)) throw new AppError("validation_error", "Unsupported News locale", 400);
  if (detail) {
    if (!slugValid(ctx.params?.slug)) throw new AppError("news_not_found", "News not found", 404);
    return { locale, slug: ctx.params.slug };
  }
  const integer = (key, fallback, max) => { const value = query.get(key) ?? String(fallback); if (!/^[1-9]\d*$/.test(value) || Number(value) > max) throw new AppError("validation_error", "Invalid News pagination", 400); return Number(value); };
  return { locale, page: integer("page", 1, 10000), pageSize: integer("page_size", 12, 50) };
}
function dto(row, detail) {
  validateNews(row);
  if (!row.publishedAt) throw new Error("Unpublished news cannot be delivered");
  const result = { slug: row.slug, title: row.title, locale_code: row.locale_code, summary: row.summary, topic: row.topic || null,
    date: row.publication_date || new Date(row.publishedAt).toISOString().slice(0, 10), cover: coverDto(row.cover, row.cover_alt),
    published_at: row.publishedAt, updated_at: row.updatedAt };
  if (detail) Object.assign(result, { body: row.body || [], seo_title: row.seo_title || null, seo_description: row.seo_description || null });
  return result;
}
const fields = [...FIELDS.filter(field => field !== "cover"), "publishedAt", "updatedAt"];
async function listNews(strapi, ctx) {
  const { locale, page, pageSize } = requestOptions(ctx);
  const selection = { status: "published", filters: { locale_code: locale } };
  const [rows, total] = await Promise.all([
    strapi.documents(UID).findMany({ ...selection, fields, populate: POPULATE, sort: ["publication_date:desc", "publishedAt:desc", "slug:asc"], start: (page - 1) * pageSize, limit: pageSize }),
    strapi.documents(UID).count(selection),
  ]);
  ctx.body = { data: rows.map(row => dto(row, false)), pagination: { page, page_size: pageSize, total, page_count: Math.ceil(total / pageSize) } };
}
async function getNews(strapi, ctx) {
  const { locale, slug } = requestOptions(ctx, true);
  const row = await strapi.documents(UID).findFirst({ status: "published", filters: { slug, locale_code: locale }, fields, populate: POPULATE });
  if (!row) throw new AppError("news_not_found", "News not found", 404);
  ctx.body = dto(row, true);
}
module.exports = { UID, FIELDS, POPULATE, validateNews, validatePersisted, coverDto, requestOptions, dto, listNews, getNews };
