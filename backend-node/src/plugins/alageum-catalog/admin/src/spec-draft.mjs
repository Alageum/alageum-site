import Decimal from "decimal.js";

// The form never interprets source strings as numbers or invents absent values.
// Draft cells keep unfinished input separate from the existing v1 JSON contract.
export const scalarFields = [
  ["power", "Power", "number"],
  ["voltage", "Voltage", "text"],
  ["voltageUnit", "Voltage unit", "text"],
  ["cooling", "Cooling", "text"],
  ["installation", "Installation", "text"],
  ["subtype", "Equipment subtype", "text"],
  ["manufacturer", "Manufacturer", "text"],
  ["series", "Series", "text"],
  ["isOrderableSku", "Orderable SKU", "boolean"],
];
export const categoryPriorities = {
  transformers: ["power", "voltage", "voltageUnit", "cooling"],
  substations: ["power", "voltage", "voltageUnit", "installation"],
  switchgear: ["voltage", "voltageUnit", "installation"],
  cabinets: ["voltage", "voltageUnit", "subtype"],
  protection: ["voltage", "voltageUnit", "subtype"],
};
export function cell(value) {
  return value === undefined ? { mode: "absent", input: "" }
    : value === null ? { mode: "null", input: "" }
      : { mode: typeof value === "string" ? "text" : typeof value, input: String(value) };
}
export function draftRow(row = { label: "", value: "" }) {
  return { source: structuredClone(row), label: row.label, value: cell(row.value), unit: cell(row.unit), page: cell(row.page) };
}
const rowGroup = (rows) => ({ present: rows !== undefined, rows: (rows || []).map(draftRow) });
export function createSpecsDraft(specs = {}) {
  return {
    source: structuredClone(specs),
    fields: Object.fromEntries(scalarFields.map(([key]) => [key, cell(specs[key])])),
    technicalSpecs: rowGroup(specs.technicalSpecs),
    variantSpecs: rowGroup(specs.variantSpecs),
    configurations: { present: specs.configurations !== undefined, rows: (specs.configurations || []).map((row) => ({ source: structuredClone(row), designation: row.designation, specifications: rowGroup(row.specifications) })) },
    notes: { present: specs.notes !== undefined, rows: [...(specs.notes || [])] },
  };
}

const numberPattern = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
export function serializeSpecsDraft(draft) {
  const errors = {};
  function value(c, path, { nonnegative = false, page = false } = {}) {
    const numericError = (exact = false) => page
      ? "Source page must be a positive safe integer"
      : nonnegative
        ? `${exact ? "Power cannot be saved exactly as a number" : "Power must be a finite nonnegative number using a decimal point"}. Retain literal ranges or source text in a text specification row`
        : exact
          ? "This number cannot be saved exactly. Choose Text to retain the source value"
          : "Enter a finite number using a decimal point, or choose Text for literal source values";
    if (c.mode === "absent") return undefined;
    if (c.mode === "null") return null;
    if (c.mode === "text") return c.input;
    if (c.mode === "boolean") {
      if (!["true", "false"].includes(c.input)) errors[path] = "Choose true or false explicitly";
      return c.input === "true";
    }
    if (c.mode !== "number" || !numberPattern.test(c.input) || !Number.isFinite(Number(c.input))) {
      errors[path] = numericError();
      return undefined;
    }
    const n = Number(c.input);
    if (Object.is(n, -0) || !new Decimal(c.input).equals(new Decimal(String(n))) || (Number.isInteger(n) && !Number.isSafeInteger(n))) {
      errors[path] = numericError(true);
    }
    if (nonnegative && n < 0) errors[path] = "Power must be nonnegative";
    if (page && (!Number.isSafeInteger(n) || n < 1)) errors[path] = numericError();
    return n;
  }
  function assign(target, key, next) { if (next === undefined) delete target[key]; else target[key] = next; }
  function rows(group, path) {
    if (!group.present) return undefined;
    if (group.rows.length > 500) errors[path] = "Use at most 500 rows";
    return group.rows.map((row, index) => {
      const prefix = `${path}.${index}`;
      const result = { ...row.source, label: row.label, value: value(row.value, `${prefix}.value`) };
      assign(result, "unit", value(row.unit, `${prefix}.unit`));
      assign(result, "page", value(row.page, `${prefix}.page`, { page: true }));
      return result;
    });
  }
  const specs = structuredClone(draft.source);
  for (const [key] of scalarFields) assign(specs, key, value(draft.fields[key], `specs.${key}`, { nonnegative: key === "power" }));
  for (const key of ["technicalSpecs", "variantSpecs"]) assign(specs, key, rows(draft[key], `specs.${key}`));
  if (draft.configurations.present) {
    if (draft.configurations.rows.length > 500) errors["specs.configurations"] = "Use at most 500 configurations";
    specs.configurations = draft.configurations.rows.map((row, index) => {
      const result = { ...row.source, designation: row.designation };
      assign(result, "specifications", rows(row.specifications, `specs.configurations.${index}.specifications`));
      return result;
    });
  } else delete specs.configurations;
  assign(specs, "notes", draft.notes.present ? [...draft.notes.rows] : undefined);
  // Keep server validation authoritative, including its UTF-8 payload limit.
  return { specs, errors };
}

export function validationErrors(error) {
  const body = error?.response?.data?.error || error?.response?.data;
  if (body?.code === "category_not_found" || body?.code === "category_not_published") return { category_id: body.message };
  return Array.isArray(body?.details) ? Object.fromEntries(body.details.filter((d) => Array.isArray(d.loc)).map((d) => [d.loc.join("."), d.msg])) : {};
}
