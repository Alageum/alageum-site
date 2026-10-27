"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { renderQuotePdf, validatePayload, NOTICE, MAX_PDF_BYTES } = require("../src/domain/quote-pdf");
const canonical = value => value === null || typeof value !== "object" ? JSON.stringify(value) : Array.isArray(value) ? `[${value.map(canonical).join(",")}]` : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
function fixture(count = 1) {
  return { schema: "alageum.quote-signing.v1", quote_id: "11111111-1111-4111-8111-111111111111", customer_organization_id: "22222222-2222-4222-8222-222222222222", comment: "Проверка: трансформатор, Қазақстан, Ә Ғ Қ Ң Ө Ұ Ү Һ І.", items: Array.from({ length: count }, (_, i) => ({ product_id: `33333333-3333-4333-8333-${String(i + 1).padStart(12, "0")}`, quantity: "2.000", product_snapshot: { public_key: `TEST-${i}`, sku: `ТМ-${i}`, translations: { ru: { name: "Трансформатор силовой", description: "Сохранённое описание" }, kk: { name: "Күштік трансформатор" } }, specs: { power: "1000 кВА" }, version: 1, price: null, currency: "KZT", price_mode: "on_request" } })) };
}
test("renderer is deterministic, embeds font, preserves input hash and never creates a fake signature", async () => {
  const text = canonical(fixture()), first = await renderQuotePdf(text), second = await renderQuotePdf(text);
  assert.deepEqual(first, second);
  assert.match(first.subarray(0, 8).toString(), /^%PDF-1\./);
  assert.ok(first.length < MAX_PDF_BYTES);
  assert.match(first.toString("latin1"), /\/FontFile2/);
  assert.match(first.toString("latin1"), new RegExp(createHash("sha256").update(text).digest("hex")));
  assert.doesNotMatch(first.toString("latin1"), /\/ByteRange|\/JavaScript|\/EmbeddedFiles|\/Launch/);
  assert.match(NOTICE, /не заказ/);
  const changed = fixture(); changed.items[0].quantity = "3.000";
  assert.notDeepEqual(first, await renderQuotePdf(canonical(changed)));
});
test("multi-page Cyrillic/Kazakh fixture retains bounded output", async () => {
  const pdf = await renderQuotePdf(canonical(fixture(35)));
  assert.ok((pdf.toString("latin1").match(/\/Type \/Page\b/g) || []).length > 1);
  assert.ok(pdf.length < MAX_PDF_BYTES);
});
test("noncanonical, oversized, spoofed, invalid-quantity and unknown snapshot inputs fail closed", () => {
  const value = fixture();
  assert.throws(() => validatePayload(JSON.stringify(value)), { code: "quote_pdf_unavailable" });
  for (const patch of [{ quantity: "0" }, { quantity: "-1" }, { quantity: "1e3" }, { quantity: 2 }, { product_id: "invalid" }, { product_snapshot: { fabricated_total: "123" } }]) {
    const input = fixture(); input.items[0] = { ...input.items[0], ...patch };
    assert.throws(() => validatePayload(canonical(input)), { code: "quote_pdf_unavailable" });
  }
  for (const comment of ["x".repeat(4001), "misleading\u202eprice", "nul\u0000byte"]) assert.throws(() => validatePayload(canonical({ ...value, comment })), { code: "quote_pdf_unavailable" });
  assert.throws(() => validatePayload("x".repeat(300000)), { code: "quote_pdf_unavailable" });
});
module.exports = { fixture, canonical };

test("unsupported glyphs are refused rather than silently replaced by blank squares", async () => {
  const value = fixture(); value.comment = "Unsupported emoji: 🚀";
  await assert.rejects(renderQuotePdf(canonical(value)), { code: "quote_pdf_unavailable" });
});
