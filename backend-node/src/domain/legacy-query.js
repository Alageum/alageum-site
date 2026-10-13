"use strict";

// Shared query coercion has no auth, support-service, or database dependencies.
const { AppError } = require("./errors");
const sensitive = key => /^(?:access_token|api_key|authorization|cookie|password|refresh_token|secret|set_cookie|token)$|_(?:password|secret|token)$/i.test(key.replaceAll("-", "_"));
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sensitive(key) ? "[REDACTED]" : redact(item)]));
  return value;
}
function invalid(details) { throw new AppError("validation_error", "Invalid request", 422, redact(details)); }
function issue(type, loc, msg, input) { return { type, loc, msg, input: loc.some(part => sensitive(String(part))) ? "[REDACTED]" : input }; }


// The legacy FastAPI route ignores unknown query keys, uses the last duplicate
// scalar, accepts integer strings such as +01 / 1.0 / 1_000, and clamps size.
// BigInt prevents overflow while deciding that a far-away page is empty; rawJSON
// preserves the original integer on the wire even beyond JS's safe range.
function pagination(query = {}) {
  const errors = [];
  const positive = (raw, fallback, field) => {
    const value = Array.isArray(raw) ? raw.at(-1) : raw;
    if (value === undefined) return fallback;
    const text = typeof value === "string" ? value.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, "") : String(value);
    const normalized = text.replace(/^([+-]?)0[0_]*(?=[1-9])/, "$1");
    if (typeof value !== "string" || !/^[+-]?\d(?:_?\d)*(?:\.0+)?$/.test(normalized)) {
      errors.push(issue("int_parsing", ["query", field], "Input should be a valid integer, unable to parse string as an integer", value)); return fallback;
    }
    const integer = normalized.replaceAll("_", "").replace(/\.0+$/, "");
    if (integer.replace(/^[+-]?0*/, "").length > 4300) {
      // Query-reference evidence corrected this diagnostic during extraction:
      // Pydantic's size error applies to bare raw input, before whitespace trim.
      const bare = /^\d+(?:\.0+)?$/.test(value);
      errors.push(issue(bare ? "int_parsing_size" : "int_parsing", ["query", field], bare ? "Unable to parse input string as an integer, exceeded maximum size" : "Input should be a valid integer, unable to parse string as an integer", value)); return fallback;
    }
    const parsed = BigInt(integer);
    if (parsed < 1n) errors.push(issue("greater_than_equal", ["query", field], "Input should be greater than or equal to 1", value));
    return parsed;
  };
  const pageValue = positive(query.page, 1n, "page"), sizeValue = positive(query.page_size, 50n, "page_size");
  if (errors.length) invalid(errors);
  const page_size = Number(sizeValue > 100n ? 100n : sizeValue);
  return { page: pageValue <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(pageValue) : JSON.rawJSON(pageValue.toString()), page_size, offset: (pageValue - 1n) * BigInt(page_size) };
}

function requestPagination(ctx) {
  if (typeof ctx.querystring !== "string") return pagination(ctx.query);
  // Strapi's nested qs parser changes bracket keys and truncates after 1000
  // parameters. FastAPI only consumes the last exact scalar query key.
  return pagination(Object.fromEntries([...new URLSearchParams(ctx.querystring)].filter(([key]) => key === "page" || key === "page_size")));
}

// The raw HTTP query is authoritative, including an empty query string. The
// object fallback exists for internal callers and cannot recover nested qs data.
function requestScalar(ctx, name) {
  if (typeof ctx.querystring === "string") return new URLSearchParams(ctx.querystring).getAll(name).at(-1);
  if (!ctx.query || !Object.hasOwn(ctx.query, name)) return undefined;
  const value = ctx.query[name];
  return Array.isArray(value) ? value.at(-1) : value;
}

function parseMine(ctx) {
  const value = requestScalar(ctx, "mine");
  if (value === undefined) return false;
  if (typeof value === "string") {
    if (/^(?:1|on|t|true|y|yes)$/i.test(value)) return true;
    if (/^(?:0|off|f|false|n|no)$/i.test(value)) return false;
  }
  invalid([issue("bool_parsing", ["query", "mine"], "Input should be a valid boolean, unable to interpret input", value)]);
}

function requestCategoryUuid(ctx) {
  const value = requestScalar(ctx, "category_id"), loc = ["query", "category_id"];
  if (value === undefined) invalid([issue("missing", loc, "Field required", null)]);
  if (typeof value !== "string") invalid([issue("uuid_type", loc, "UUID input should be a string, bytes or UUID object", value)]);

  let text = value, wrapped = false, prefixLength = 0;
  if (text.startsWith("{") && text.endsWith("}")) { text = text.slice(1, -1); wrapped = true; prefixLength = 1; }
  else if (text.startsWith("urn:uuid:")) { text = text.slice(9); wrapped = true; prefixLength = 9; }
  if ((!wrapped && /^[0-9a-f]{32}$/i.test(text)) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    const hex = text.replaceAll("-", "").toLowerCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  // Pydantic-core's UUID parser diagnoses characters before group lengths. Its
  // fixed-width wrapped fast path reports positions within the canonical body.
  let reason;
  const invalidCharacter = /[^0-9a-f-]/iu.exec(text);
  if (invalidCharacter) {
    const position = Buffer.byteLength(text.slice(0, invalidCharacter.index)) + (Buffer.byteLength(text) === 36 ? 0 : prefixLength) + 1;
    reason = `invalid character: found \`${invalidCharacter[0]}\` at ${position}`;
  } else if (!wrapped && !text.includes("-")) {
    reason = `invalid length: expected length 32 for simple format, found ${text.length}`;
  } else {
    const groups = text.split("-"), expected = [8, 4, 4, 4, 12];
    if (groups.length !== 5) reason = `invalid group count: expected 5, found ${groups.length}`;
    else {
      const group = groups.findIndex((part, index) => part.length !== expected[index]);
      reason = `invalid group length in group ${group}: expected ${expected[group]}, found ${groups[group].length}`;
    }
  }
  invalid([issue("uuid_parsing", loc, `Input should be a valid UUID, ${reason}`, value)]);
}

// FastAPI validates dependencies (PageParams) before route-level scalars and
// returns their errors together. Do not stop at the first invalid query field.
function combinedQuery(ctx, scalar, name) {
  const errors = [];
  let page, value;
  for (const validate of [() => { page = requestPagination(ctx); }, () => { value = scalar(ctx); }]) {
    try { validate(); }
    catch (error) {
      if (!(error instanceof AppError) || error.code !== "validation_error") throw error;
      errors.push(...error.details);
    }
  }
  if (errors.length) invalid(errors);
  return { [name]: value, ...page };
}
const requestFilterQuery = ctx => combinedQuery(ctx, requestCategoryUuid, "category_id");
const requestQuoteQuery = ctx => combinedQuery(ctx, parseMine, "mine");

module.exports = { pagination, requestPagination, requestScalar, parseMine, requestCategoryUuid, requestFilterQuery, requestQuoteQuery };
