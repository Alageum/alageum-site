import React, { useId } from "react";
import { categoryPriorities, draftRow, scalarFields } from "../spec-draft.mjs";

export function SpecField({ label, path, errors, children }) {
  const id = useId();
  const error = errors[path];
  return <div className="alageum-field"><label htmlFor={id}>{label}</label>{React.cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined })}{error && <span id={`${id}-error`} className="alageum-field-error">{error}</span>}</div>;
}

function Cell({ label, value, modes, path, errors, onChange }) {
  const titles = { absent: "Not recorded", null: "No stated value", text: "Text", number: "Number", boolean: "True / false" };
  return <div className="alageum-spec-cell">
    <SpecField label={`${label} type`} path={`${path}.type`} errors={errors}><select value={value.mode} onChange={(e) => onChange({ mode: e.target.value, input: e.target.value === "boolean" && value.mode !== "boolean" ? "" : value.input })}>{modes.map((mode) => <option key={mode} value={mode}>{titles[mode]}</option>)}</select></SpecField>
    {value.mode === "text" && <SpecField label={label} path={path} errors={errors}><textarea rows={2} value={value.input} onChange={(e) => onChange({ ...value, input: e.target.value })} /></SpecField>}
    {value.mode === "number" && <SpecField label={label} path={path} errors={errors}><input value={value.input} inputMode="decimal" onChange={(e) => onChange({ ...value, input: e.target.value })} /></SpecField>}
    {value.mode === "boolean" && <SpecField label={label} path={path} errors={errors}><select value={value.input} onChange={(e) => onChange({ ...value, input: e.target.value })}><option value="" disabled>Choose a value</option><option value="false">False</option><option value="true">True</option></select></SpecField>}
    {["absent", "null"].includes(value.mode) && errors[path] && <p className="alageum-field-error">{errors[path]}</p>}
  </div>;
}

function Rows({ title, group, path, errors, onChange }) {
  const update = (index, key, value) => onChange({ ...group, rows: group.rows.map((row, i) => i === index ? { ...row, [key]: value } : row) });
  return <section className="alageum-spec-group" aria-label={title}>
    <h3>{title}</h3>
    {errors[path] && <p className="alageum-field-error">{errors[path]}</p>}
    {group.rows.length === 0 && <p className="alageum-muted">No rows recorded</p>}
    {group.rows.map((row, index) => <fieldset className="alageum-spec-row" key={index} aria-label={`${title} row ${index + 1}`}>
      <legend>{title} · {index + 1}</legend>
      <SpecField label="Specification label" path={`${path}.${index}.label`} errors={errors}><textarea rows={2} value={row.label} onChange={(e) => update(index, "label", e.target.value)} /></SpecField>
      <div className="alageum-grid">
        <Cell label="Specification value" value={row.value} modes={["text", "number"]} path={`${path}.${index}.value`} errors={errors} onChange={(value) => update(index, "value", value)} />
        <Cell label="Unit" value={row.unit} modes={["absent", "null", "text"]} path={`${path}.${index}.unit`} errors={errors} onChange={(value) => update(index, "unit", value)} />
      </div>
      <details open={Boolean(errors[`${path}.${index}.page`]) || undefined}><summary>Source reference</summary><Cell label="Source page" value={row.page} modes={["absent", "number"]} path={`${path}.${index}.page`} errors={errors} onChange={(value) => update(index, "page", value)} /><p className="alageum-muted">Keep the cited source page when changing a row. Other source metadata is retained.</p></details>
      <button type="button" onClick={() => onChange({ ...group, rows: group.rows.filter((_, i) => i !== index) })}>Remove row {index + 1}</button>
    </fieldset>)}
    <button type="button" disabled={group.rows.length >= 500} onClick={() => onChange({ present: true, rows: [...group.rows, draftRow()] })}>Add {title.toLowerCase()} row</button>
  </section>;
}

export default function Specifications({ draft, category, errors, onChange }) {
  const set = (key, value) => onChange({ ...draft, [key]: value });
  const priorities = categoryPriorities[category?.public_key] || [];
  const orderedFields = [...scalarFields].sort((a, b) => {
    const position = (key) => priorities.includes(key) ? priorities.indexOf(key) : 100;
    return position(a[0]) - position(b[0]);
  });
  return <details className="alageum-specifications" open={Object.keys(errors).some((key) => key === "specs" || key.startsWith("specs.")) || undefined}>
    <summary>Structured specifications</summary>
    <p>Category: {category?.translations?.ru?.name || category?.public_key || "Select a category"}{category && !category.is_published ? " (unpublished)" : ""}</p>
    <p className="alageum-muted">Enter values and units exactly as the source states them. Ranges and decimal commas belong in Text. Category changes keep every specification; review their relevance before saving. Missing values remain missing until you explicitly enter them.</p>
    {errors.specs && <p className="alageum-field-error">{errors.specs}</p>}
    <details open={scalarFields.some(([key]) => errors[`specs.${key}`]) || undefined}><summary>Catalog attributes</summary><div className="alageum-grid">{orderedFields.map(([key, label, type]) => <Cell key={key} label={label} value={draft.fields[key]} modes={type === "boolean" ? ["absent", "boolean"] : ["absent", "null", type]} path={`specs.${key}`} errors={errors} onChange={(value) => set("fields", { ...draft.fields, [key]: value })} />)}</div><p className="alageum-muted">Power has no separate unit in this legacy field. Keep source units in specification rows; no units are inferred or converted.</p></details>
    <Rows title="Technical specifications" group={draft.technicalSpecs} path="specs.technicalSpecs" errors={errors} onChange={(value) => set("technicalSpecs", value)} />
    <details open={Object.keys(errors).some((key) => key.startsWith("specs.variantSpecs")) || undefined}><summary>Variant specifications</summary><Rows title="Variant specifications" group={draft.variantSpecs} path="specs.variantSpecs" errors={errors} onChange={(value) => set("variantSpecs", value)} /></details>
    <details open={Object.keys(errors).some((key) => key.startsWith("specs.configurations")) || undefined}><summary>Configurations</summary>
      {errors["specs.configurations"] && <p className="alageum-field-error">{errors["specs.configurations"]}</p>}
      {draft.configurations.rows.map((row, index) => <fieldset className="alageum-spec-row" key={index} aria-label={`Configuration ${index + 1}`}><legend>Configuration {index + 1}</legend>
        <SpecField label="Configuration designation" path={`specs.configurations.${index}.designation`} errors={errors}><textarea rows={2} value={row.designation} onChange={(e) => set("configurations", { ...draft.configurations, rows: draft.configurations.rows.map((item, i) => i === index ? { ...item, designation: e.target.value } : item) })} /></SpecField>
        <Rows title={`Configuration ${index + 1} specifications`} group={row.specifications} path={`specs.configurations.${index}.specifications`} errors={errors} onChange={(value) => set("configurations", { ...draft.configurations, rows: draft.configurations.rows.map((item, i) => i === index ? { ...item, specifications: value } : item) })} />
        <button type="button" onClick={() => set("configurations", { ...draft.configurations, rows: draft.configurations.rows.filter((_, i) => i !== index) })}>Remove configuration {index + 1}</button>
      </fieldset>)}
      <button type="button" disabled={draft.configurations.rows.length >= 500} onClick={() => set("configurations", { present: true, rows: [...draft.configurations.rows, { source: {}, designation: "", specifications: { present: false, rows: [] } }] })}>Add configuration</button>
    </details>
    <details><summary>Specification notes</summary>{draft.notes.rows.map((note, index) => <div key={index} className="alageum-spec-row"><SpecField label={`Specification note ${index + 1}`} path={`specs.notes.${index}`} errors={errors}><textarea rows={3} value={note} onChange={(e) => set("notes", { ...draft.notes, rows: draft.notes.rows.map((text, i) => i === index ? e.target.value : text) })} /></SpecField><button type="button" onClick={() => set("notes", { ...draft.notes, rows: draft.notes.rows.filter((_, i) => i !== index) })}>Remove note {index + 1}</button></div>)}<button type="button" onClick={() => set("notes", { present: true, rows: [...draft.notes.rows, ""] })}>Add specification note</button></details>
  </details>;
}
