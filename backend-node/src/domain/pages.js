"use strict";
const { AppError } = require("./errors");
const UID = "api::page.page";
const FIELDS = ["slug", "title", "locale_code", "body", "seo_title", "seo_description"];
const LOCALES = new Set(["ru", "kk", "en", "zh", "uz"]);
const LIMITS = Object.freeze({ depth: 8, blocks: 200, children: 200, nodes: 2000, text: 100000, bytes: 480 * 1024 });
function slugValid(value) { return typeof value === "string" && value.length <= 160 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value); }
function safeUrl(value) {
  if (typeof value !== "string" || !value || value.length > 2048 || /[\s\u0000-\u001f\u007f\\]/u.test(value)) return false;
  if (value.startsWith("/") && !value.startsWith("//")) return true;
  if (/^#[A-Za-z0-9_-]+$/.test(value)) return true;
  try { const url = new URL(value); return ["http:", "https:", "mailto:", "tel:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}
function validateBlocks(body) {
  if (!Array.isArray(body) || body.length > LIMITS.blocks) throw new Error("Page body must be bounded Blocks content");
  let nodes = 0, characters = 0;
  const own = (node, allowed) => {
    if (!node || typeof node !== "object" || Array.isArray(node) || Object.keys(node).some(key => !allowed.includes(key))) throw new Error("Unsupported Page block fields");
  };
  function visit(node, depth, parent) {
    if (++nodes > LIMITS.nodes || depth > LIMITS.depth) throw new Error("Page body is too complex");
    const type = node?.type;
    if (type === "text") {
      own(node, ["type", "text", "bold", "italic", "underline", "strikethrough", "code"]);
      if (!["paragraph", "heading", "quote", "code", "link", "list-item"].includes(parent) || typeof node.text !== "string") throw new Error("Invalid Page text placement");
      for (const key of ["bold", "italic", "underline", "strikethrough", "code"]) if (key in node && typeof node[key] !== "boolean") throw new Error("Invalid text mark");
      characters += node.text.length;
      if (characters > LIMITS.text) throw new Error("Page text is too long");
      return;
    }
    const allowed = ["type", "children"];
    if (type === "heading") allowed.push("level");
    if (type === "list") allowed.push("format");
    if (type === "link") allowed.push("url");
    own(node, allowed);
    if (!["paragraph", "heading", "quote", "code", "list", "list-item", "link"].includes(type)) throw new Error("Unsupported Page block type");
    if (parent === null && ["link", "list-item"].includes(type)) throw new Error("Invalid root Page block");
    if (parent !== null && !(parent === "list" && type === "list-item") && !(parent === "list-item" && type === "list") && !(["paragraph", "heading", "quote", "list-item"].includes(parent) && type === "link")) throw new Error("Invalid nested Page block");
    if (type === "heading" && (!Number.isInteger(node.level) || node.level < 1 || node.level > 6)) throw new Error("Invalid heading level");
    if (type === "list" && !["ordered", "unordered"].includes(node.format)) throw new Error("Invalid list format");
    if (type === "link" && !safeUrl(node.url)) throw new Error("Unsafe Page link");
    if (!Array.isArray(node.children) || node.children.length > LIMITS.children) throw new Error("Invalid block children");
    for (const child of node.children) visit(child, depth + 1, type);
  }
  for (const node of body) visit(node, 0, null);
  if (Buffer.byteLength(JSON.stringify(body), "utf8") > LIMITS.bytes) throw new Error("Page body exceeds delivery budget");
  return body;
}
function validatePage(data) {
  if (!data || typeof data !== "object" || !slugValid(data.slug) || !LOCALES.has(data.locale_code)) throw new Error("Invalid Page slug or locale");
  if (typeof data.title !== "string" || !data.title.trim() || data.title.length > 240) throw new Error("Invalid Page title");
  for (const [field, max] of [["seo_title", 240], ["seo_description", 500]]) if (data[field] != null && (typeof data[field] !== "string" || data[field].length > max)) throw new Error(`Invalid Page ${field}`);
  validateBlocks(data.body ?? []);
  return data;
}
function parsePageRequest(ctx) {
  const slug = ctx.params?.slug;
  if (!slugValid(slug)) throw new AppError("page_not_found", "Page not found", 404);
  const query = new URLSearchParams(ctx.querystring || "");
  if ([...query.keys()].some(key => key !== "locale") || query.getAll("locale").length > 1) throw new AppError("validation_error", "Only one exact locale is accepted", 400);
  const locale = query.get("locale") ?? "ru";
  if (!LOCALES.has(locale)) throw new AppError("validation_error", "Unsupported Page locale", 400);
  return { slug, locale };
}
async function getPage(strapi, ctx) {
  if (ctx.method !== "GET") throw new AppError("page_not_found", "Page not found", 404);
  const { slug, locale } = parsePageRequest(ctx);
  const page = await strapi.documents(UID).findFirst({ status: "published", filters: { slug, locale_code: locale }, fields: [...FIELDS, "publishedAt", "updatedAt"] });
  if (!page) throw new AppError("page_not_found", "Page not found", 404);
  validatePage(page);
  ctx.body = {
    slug: page.slug, title: page.title, locale_code: page.locale_code, body: page.body ?? [],
    seo_title: page.seo_title ?? null, seo_description: page.seo_description ?? null,
    published_at: page.publishedAt, updated_at: page.updatedAt,
  };
}
module.exports = { UID, FIELDS, LOCALES, LIMITS, slugValid, safeUrl, validateBlocks, validatePage, parsePageRequest, getPage };
