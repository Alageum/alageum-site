"use strict";
const { createHash } = require("node:crypto");
const path = require("node:path");
const fs = require("node:fs");
const { PDFDocument } = require("pdfkit");
const fontkit = require("node:module").createRequire(require.resolve("pdfkit"))("fontkit");
const { AppError } = require("./errors");
const FONT = path.join(__dirname, "../../assets/fonts/NotoSans-Regular.ttf");
const FONT_SHA256 = "b85c38ecea8a7cfb39c24e395a4007474fa5a4fc864f6ee33309eb4948d232d5";
const MAX_PDF_BYTES = 1024 * 1024, MAX_PAYLOAD_BYTES = 256 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOTICE = "Цены справочные, сохранены в запросе покупателя. Это не коммерческое предложение продавца, не заказ и не обязательство поставить товар по указанной цене. Наличие, итоговую стоимость и условия поставки необходимо согласовать отдельно. Подпись ЭЦП не проставлена в этом исходном PDF.";
const fail = message => { throw new AppError("quote_pdf_unavailable", message, 422); };
const object = value => value !== null && typeof value === "object" && !Array.isArray(value);
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
}
function boundedText(value, max = 8192) {
  if (typeof value !== "string" || value.length > max || !value.isWellFormed() || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f\u202a-\u202e\u2066-\u2069]/u.test(value)) fail("Saved text cannot be safely rendered");
  return value;
}
function validatePayload(text) {
  if (typeof text !== "string" || Buffer.byteLength(text) > MAX_PAYLOAD_BYTES) fail("Saved selection exceeds PDF limits");
  let value;
  try { value = JSON.parse(text); } catch { fail("Saved selection is invalid"); }
  const keys = ["comment", "customer_organization_id", "items", "quote_id", "schema"];
  if (!object(value) || Object.keys(value).sort().join() !== keys.join() || canonical(value) !== text || value.schema !== "alageum.quote-signing.v1" || !UUID.test(value.quote_id) || !UUID.test(value.customer_organization_id)) fail("A canonical saved catalog selection is required");
  if (value.comment !== null) boundedText(value.comment, 4000);
  if (!Array.isArray(value.items) || value.items.length < 1 || value.items.length > 100) fail("Invalid saved item count");
  const ids = new Set(), allowed = new Set(["public_key", "slug", "sku", "translations", "specs", "category_public_key", "version", "price", "currency", "price_mode"]);
  for (const item of value.items) {
    if (!object(item) || Object.keys(item).sort().join() !== "product_id,product_snapshot,quantity" || !UUID.test(item.product_id) || ids.has(item.product_id) || typeof item.quantity !== "string" || !/^(?:0|[1-9]\d{0,14})(?:\.\d{1,3})?$/.test(item.quantity) || !/[1-9]/.test(item.quantity)) fail("Invalid saved catalog item");
    ids.add(item.product_id);
    const snapshot = item.product_snapshot;
    if (!object(snapshot) || !Object.keys(snapshot).length || Object.keys(snapshot).some(key => !allowed.has(key))) fail("Unsupported saved product snapshot");
    // Render every saved field below, not a newer catalog lookup or a hidden enrichment.
    for (const field of Object.values(snapshot)) boundedText(typeof field === "string" ? field : canonical(field));
    if (snapshot.price !== null && snapshot.price !== undefined && (typeof snapshot.price !== "string" || !/^\d+(?:\.\d+)?$/.test(snapshot.price))) fail("Invalid saved reference price");
  }
  return value;
}
const fieldLabels = { public_key: "Ключ товара", slug: "Адрес в каталоге", sku: "Артикул", translations: "Сохранённые названия и описания", specs: "Характеристики", category_public_key: "Категория", version: "Версия товара", price: "Справочная цена за единицу", currency: "Валюта", price_mode: "Режим цены" };
function displayValue(key, value) {
  if (value === null || value === undefined || value === "") return "Не сохранено";
  if (key === "price_mode") return value === "on_request" ? "По запросу (on_request)" : value === "fixed" ? "Справочная цена каталога (fixed)" : String(value);
  return typeof value === "string" ? value : canonical(value);
}
async function renderQuotePdf(payloadString) {
  const value = validatePayload(payloadString), hash = createHash("sha256").update(payloadString).digest("hex");
  const font = fs.readFileSync(FONT);
  if (createHash("sha256").update(font).digest("hex") !== FONT_SHA256) fail("Reviewed PDF font integrity failed");
  const coverage = fontkit.create(font);
  for (const character of new Set(payloadString + NOTICE)) {
    if (!["\n", "\r", "\t"].includes(character) && !coverage.hasGlyphForCodePoint(character.codePointAt(0))) fail("Saved selection contains characters unsupported by the reviewed PDF font");
  }
  // Fixed metadata is intentional: dates not present in the immutable input must
  // not be invented. The payload hash uniquely identifies these exact source bytes.
  const doc = new PDFDocument({ size: "A4", margins: { top: 48, right: 48, bottom: 72, left: 48 }, font: FONT, bufferPages: true,
    info: { Title: "Запрос КП - итоговый список покупателя", Author: "ALAGEUM", Subject: `Saved catalog payload SHA-256: ${hash}`, Creator: "ALAGEUM quote renderer v1", Producer: "PDFKit 0.20.2", CreationDate: new Date(0), ModDate: new Date(0) } });
  const output = new Promise((resolve, reject) => {
    const chunks = []; let bytes = 0;
    doc.on("data", chunk => { bytes += chunk.length; if (bytes > MAX_PDF_BYTES) doc.destroy(new AppError("quote_pdf_unavailable", "Generated PDF exceeds storage limit", 422)); else chunks.push(chunk); });
    doc.on("error", reject); doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
  try {
    doc.fontSize(20).fillColor("#123650").text("Запрос КП");
    doc.fontSize(13).text("Итоговый список покупателя").moveDown(0.6);
    doc.fontSize(9).fillColor("#334155").text(`Запрос: ${value.quote_id}`).text(`Организация покупателя: ${value.customer_organization_id}`).text(`Позиций: ${value.items.length}`).moveDown();
    doc.fontSize(9).fillColor("#111827").text(NOTICE, { lineGap: 2 }).moveDown();
    if (value.comment) doc.fontSize(10).text("Сообщение покупателя").fontSize(9).text(value.comment, { lineGap: 2 }).moveDown();
    for (const [index, item] of value.items.entries()) {
      const lines = [`ID товара: ${item.product_id}`, `Количество: ${item.quantity}`,
        ...Object.keys(item.product_snapshot).sort().map(key => `${fieldLabels[key]}: ${displayValue(key, item.product_snapshot[key])}`),
        ...(item.product_snapshot.price == null ? ["Справочная цена отсутствует; итоговая сумма не рассчитывается."] : [])];
      doc.fontSize(9);
      const estimated = 48 + lines.reduce((height, line) => height + doc.heightOfString(line, { lineGap: 1 }), 0);
      const bottom = doc.page.height - doc.page.margins.bottom;
      if ((estimated < bottom - doc.page.margins.top && doc.y + estimated > bottom) || doc.y > bottom - 80) doc.addPage();
      doc.fontSize(12).fillColor("#123650").text(`Позиция ${index + 1}`).moveDown(0.25);
      doc.fontSize(9).fillColor("#111827").text(`ID товара: ${item.product_id}`).text(`Количество: ${item.quantity}`).moveDown(0.3);
      for (const key of Object.keys(item.product_snapshot).sort()) {
        doc.text(`${fieldLabels[key]}: ${displayValue(key, item.product_snapshot[key])}`, { lineGap: 1 });
      }
      if (item.product_snapshot.price == null) doc.text("Справочная цена отсутствует; итоговая сумма не рассчитывается.");
      doc.moveDown(1);
    }
    doc.fontSize(8).fillColor("#475569").text(`SHA-256 исходного сохранённого списка: ${hash}`).moveDown(0.4).text("Конец списка. Подписание выполняется отдельно через ЭЦП с серверной проверкой.");
    const range = doc.bufferedPageRange();
    if (range.count > 100) fail("Generated PDF exceeds page limit");
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      // Keep footer within the page's content area; no page may be added here.
      doc.fontSize(8).fillColor("#64748b").text(`${i + 1} / ${range.count}`, 48, 785, { lineBreak: false });
    }
    doc.end();
  } catch (error) { doc.destroy(error); }
  return output;
}
module.exports = { renderQuotePdf, validatePayload, NOTICE, MAX_PDF_BYTES, MAX_PAYLOAD_BYTES };
