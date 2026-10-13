"use strict";
const { z } = require("zod");
const { AppError } = require("./errors");
const Decimal = require("decimal.js");
const assets = new Set(require("../../data/public-assets.json"));
const key = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const uuid = z
  .string()
  .uuid()
  .transform((s) => s.toLowerCase());
const currencies = new Set(
  "AED AFN ALL AMD ANG AOA ARS AUD AWG AZN BAM BBD BDT BGN BHD BIF BMD BND BOB BOV BRL BSD BTN BWP BYN BZD CAD CDF CHE CHF CHW CLF CLP CNY COP COU CRC CUP CVE CZK DJF DKK DOP DZD EGP ERN ETB EUR FJD FKP GBP GEL GHS GIP GMD GNF GTQ GYD HKD HNL HTG HUF IDR ILS INR IQD IRR ISK JMD JOD JPY KES KGS KHR KMF KPW KRW KWD KYD KZT LAK LBP LKR LRD LSL LYD MAD MDL MGA MKD MMK MNT MOP MRU MUR MVR MWK MXN MXV MYR MZN NAD NGN NIO NOK NPR NZD OMR PAB PEN PGK PHP PKR PLN PYG QAR RON RSD RUB RWF SAR SBD SCR SDG SEK SGD SHP SLE SOS SRD SSP STN SVC SYP SZL THB TJS TMT TND TOP TRY TTD TWD TZS UAH UGX USD USN UYI UYU UYW UZS VED VES VND VUV WST XAF XAG XAU XBA XBB XBC XBD XCD XCG XDR XOF XPD XPF XPT XSU XUA YER ZAR ZMW ZWG".split(
    " ",
  ),
);
const textNumber = z.union([z.string(), z.number().finite()]);
const specRow = z
  .object({
    label: z.string(),
    value: textNumber,
    unit: z.string().nullable().optional(),
    page: z.number().int().positive().optional(),
  })
  .passthrough();
const rows = z.array(specRow).max(500);
const specs = z
  .object({
    technicalSpecs: rows.optional(),
    variantSpecs: rows.optional(),
    configurations: z
      .array(
        z
          .object({ designation: z.string(), specifications: rows.optional() })
          .passthrough(),
      )
      .max(500)
      .optional(),
    notes: z.array(z.string()).optional(),
    manufacturers: z.array(z.string()).optional(),
    variantIds: z.array(z.string()).optional(),
    power: z.number().finite().nonnegative().nullable().optional(),
    isOrderableSku: z.boolean().optional(),
    ...Object.fromEntries(
      [
        "voltage",
        "voltageUnit",
        "cooling",
        "installation",
        "subtype",
        "manufacturer",
        "recordKind",
        "recordType",
        "series",
        "familyId",
        "familyName",
      ].map((k) => [k, z.string().nullable().optional()]),
    ),
  })
  .passthrough();
const safeUrl = z
  .string()
  .max(2000)
  .refine((s) => {
    try {
      const u = new URL(s);
      return (
        /^https?:$/.test(u.protocol) &&
        !u.username &&
        !u.password &&
        !/[\s\\\x00-\x20]/.test(s)
      );
    } catch {
      return false;
    }
  });
const provenance = z
  .object({
    sourceUrl: z
      .union([safeUrl, z.literal("")])
      .nullable()
      .optional(),
    additionalSources: z
      .array(
        z.object({ label: z.string().optional(), url: safeUrl }).passthrough(),
      )
      .max(50)
      .optional(),
    sourcePages: z.array(z.number().int().positive()).optional(),
    ...Object.fromEntries(
      ["sourceKind", "sourceTitle", "sourceCheckedAt"].map((k) => [
        k,
        z.string().nullable().optional(),
      ]),
    ),
  })
  .passthrough();
function bounded(schema) {
  return schema.refine((v) => {
    try {
      return Buffer.byteLength(JSON.stringify(v)) <= 256 * 1024;
    } catch {
      return false;
    }
  }, "Catalog data must not exceed 256 KiB");
}
const media = z
  .object({
    path: z.string().max(500),
    kind: z.enum(["image", "document"]).default("image"),
    alt: z.string().max(1000).nullable().optional(),
  })
  .strict()
  .refine(
    (v) =>
      assets.has(v.path) &&
      !v.path
        .split("/")
        .slice(1)
        .some((p) => ["", ".", ".."].includes(p)) &&
      /^\/(catalog-products|catalog-source|brand)\/[A-Za-z0-9_./-]+$/.test(
        v.path,
      ) &&
      (v.kind === "document"
        ? /\.pdf$/i
        : /\.(png|jpe?g|webp|avif|gif)$/i
      ).test(v.path),
    "Media must reference a shipped canonical catalog asset",
  );
const money = z
  .union([z.string(), z.number().finite()])
  .refine((v) => {
    try {
      let d = new Decimal(v);
      return (
        d.isFinite() &&
        !d.isNegative() &&
        d.decimalPlaces() <= 2 &&
        d.lt("10000000000000000")
      );
    } catch {
      return false;
    }
  }, "Invalid decimal money")
  .transform((v) => new Decimal(v).toFixed(2));
const translations = z
  .record(
    z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
    z
      .object({
        name: z.string().max(500).optional(),
        description: z.string().max(20000).optional(),
      })
      .strict(),
  )
  .refine(
    (v) => Object.values(v).some((t) => t.name?.trim()),
    "A translated product name is required",
  );
const shape = {
  category_id: uuid,
  slug: key,
  sku: z
    .string()
    .min(1)
    .max(120)
    .refine((s) => s.trim() === s && !/[\x00-\x1f]/.test(s))
    .nullable()
    .default(null),
  translations,
  status: z.enum(["draft", "published", "hidden"]).default("draft"),
  comparable: z.boolean().default(true),
  price: money.nullable().default(null),
  currency: z
    .string()
    .refine((s) => currencies.has(s))
    .nullable()
    .default(null),
  price_mode: z.enum(["on_request", "fixed"]).default("on_request"),
  specs: bounded(specs).default({}),
  provenance: bounded(provenance).default({}),
  media: z.array(media).max(50).default([]),
};
function consistent(s) {
  return s.superRefine((v, ctx) => {
    if (v.price_mode === "fixed" && (v.price === null || v.currency === null))
      ctx.addIssue({
        code: "custom",
        message: "Fixed prices require price and currency",
      });
    if (v.price_mode === "on_request" && v.price !== null)
      ctx.addIssue({
        code: "custom",
        message: "On-request prices must be null",
      });
  });
}
const fields = consistent(z.object(shape).strict());
const create = consistent(z.object({ ...shape, public_key: key }).strict());
const patch = z
  .object({
    ...Object.fromEntries(
      Object.entries(shape).map(([k, v]) => [
        k,
        v.removeDefault ? v.removeDefault().optional() : v.optional(),
      ]),
    ),
    version: z.number().int().min(1),
  })
  .strict();
const version = z.object({ version: z.number().int().min(1) }).strict();
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new AppError(
      "validation_error",
      "Invalid request",
      422,
      result.error.issues.map((e) => ({ loc: e.path, msg: e.message })),
    );
  return result.data;
}
module.exports = { parse, fields, create, patch, version, uuid, key };
