import React, { useEffect, useState } from "react";
import { useFetchClient } from "@strapi/strapi/admin";
import { SpecField } from "./Specifications";
import { addReviewedMedia, changeMediaAlt, moveMedia, removeMedia, restoreReviewedMedia, reviewedEntry } from "../media-draft.mjs";
import { startMediaPreview } from "../media-preview.mjs";
import { errorMessage } from "../client-guards.mjs";

const pages = (values) => values?.length ? values.join(", ") : "Not recorded";
const representation = (entry) => entry.representation === "source-scan" ? "Full source page scan" : "Product crop";
const altLabel = (item) => !Object.hasOwn(item, "alt") ? "Not recorded (absent)" : item.alt === null ? "No stated value (null)" : item.alt === "" ? 'Empty text ("")' : item.alt;

function Preview({ productId, entry, token }) {
  const { get } = useFetchClient();
  const [state, setState] = useState(null);
  useEffect(() => {
    const request = startMediaPreview({ get, productId, entry, token, onState: (next) => setState({ ...next, productId, entryId: entry.id, token }) });
    return request.cancel;
  }, [get, productId, entry.id, entry.mime, token]);
  // Hide the old image during the render before effect cleanup on selection or
  // token changes. Account changes also unmount the entire Catalog tree.
  const current = state?.productId === productId && state?.entryId === entry.id && state?.token === token ? state : null;
  return <figure className="alageum-media-preview" aria-label="Reviewed image preview" aria-busy={!current || current.loading}>
    {(!current || current.loading) && <p role="status">Loading authenticated preview…</p>}
    {current?.error && <p className="alageum-error" role="alert">{errorMessage(current.error)}</p>}
    {current?.url && <img src={current.url} alt={`Reviewed ${representation(entry).toLowerCase()}, source pages ${pages(entry.source_pages)}`} onError={() => setState((value) => ({ ...value, error: new Error("The preview image could not be displayed"), url: "" }))} />}
    <figcaption>{representation(entry)} · Source pages: {pages(entry.source_pages)}</figcaption>
  </figure>;
}

export default function Media({ draft, options, optionsError, optionsLoading, productId, token, isNew, dirty, errors, onChange }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = options?.entries.find((entry) => entry.id === selectedId);
  const disabled = !options || optionsLoading;
  const update = (next) => { if (next !== draft) onChange(next); };
  return <details className="alageum-media" open={Object.keys(errors).some((key) => key === "media" || key.startsWith("media.")) || undefined}>
    <summary>Product media{dirty ? " · Unsaved changes" : ""}</summary>
    <p className="alageum-muted">Review this product’s existing attachments and its reviewed image choices. Path, kind and source references are read-only. Saving other fields keeps media exactly as stored.</p>
    {errors.media && <p className="alageum-field-error">{errors.media}</p>}
    {isNew && <p>New products start without media. Reviewed images are assigned to imported products; there is no reviewed image to attach to a new product.</p>}
    {optionsLoading && <p role="status">Loading reviewed image choices…</p>}
    {optionsError && <p className="alageum-error" role="alert">{optionsError} Reload the product to refresh its image choices.</p>}
    {options?.baseline_override && <p className="alageum-media-note">The saved media matches the exact unedited import. The public catalog uses the reviewed default for that array. For this source exception, the imported crop is from page 39 while the reviewed image is the full scan of page 38. Restore reviewed media to explicitly save the reviewed image. The imported crop’s alternative text stays read-only.</p>}
    {!isNew && options && !options.reviewed.length && <p>This product has no reviewed image. The current review includes 24 imported products with an empty reviewed default. Existing legacy attachments remain until you remove them or restore the empty reviewed array.</p>}
    <h3>Attached media</h3>
    <p className="alageum-muted">The public product displays the first image in attachment order. Alternative text describes that image for accessibility; source and approximation notices stay separate.</p>
    {draft.length === 0 && <p className="alageum-muted">No attachments</p>}
    {draft.map((row, index) => {
      const entry = reviewedEntry(row.source, options);
      return <fieldset className="alageum-media-row" key={index} aria-label={`Attachment ${index + 1}`} disabled={disabled}>
        <legend>Attachment {index + 1}</legend>
        <dl className="alageum-media-meta"><dt>Path</dt><dd>{row.source.path}</dd><dt>Kind</dt><dd>{row.source.kind || "Not recorded"}</dd><dt>Image source</dt><dd>{entry ? `${representation(entry)} · Source pages: ${pages(entry.source_pages)}` : "Legacy attachment, outside this product’s reviewed images"}</dd></dl>
        {entry ? <>
          <SpecField label={`Alternative text state for attachment ${index + 1}`} path={`media.${index}.alt`} errors={errors}><select value={row.alt.mode} onChange={(event) => update(changeMediaAlt(draft, index, { ...row.alt, mode: event.target.value }, options))}><option value="absent">Not recorded (absent)</option><option value="null">No stated value (null)</option><option value="text">Text (may be empty)</option></select></SpecField>
          {row.alt.mode === "text" && <SpecField label={`Alternative text for attachment ${index + 1}`} path={`media.${index}.alt`} errors={errors}><textarea rows={2} maxLength={1000} value={row.alt.input} onChange={(event) => update(changeMediaAlt(draft, index, { ...row.alt, input: event.target.value }, options))} /></SpecField>}
          <p className="alageum-muted">Not recorded, null and empty text are distinct values. Choose a state explicitly to change it.</p>
        </> : <><dl className="alageum-media-meta"><dt>Alternative text (read-only)</dt><dd>{altLabel(row.source)}</dd></dl><p className="alageum-muted">Legacy media can be removed or reordered. Its path, kind and alternative text are retained as stored.</p></>}
        <div className="alageum-actions"><button type="button" onClick={() => update(removeMedia(draft, index))}>Remove attachment {index + 1}</button><button type="button" disabled={index === 0} onClick={() => update(moveMedia(draft, index, -1))}>Move attachment {index + 1} up</button><button type="button" disabled={index === draft.length - 1} onClick={() => update(moveMedia(draft, index, 1))}>Move attachment {index + 1} down</button>{entry && <button type="button" aria-pressed={selectedId === entry.id} onClick={() => setSelectedId(entry.id)}>Preview attachment {index + 1}</button>}</div>
      </fieldset>;
    })}
    {options && <section className="alageum-media-choices" aria-label="Reviewed images for this product">
      <h3>Reviewed images for this product</h3>
      <p className="alageum-muted">Product source pages: {pages(options.source_pages)}. A full source page scan includes surrounding catalog content; a crop is a product detail. Neither representation is a new upload.</p>
      {options.entries.map((entry) => <div className="alageum-media-choice" key={entry.id}>
        <dl className="alageum-media-meta"><dt>Path</dt><dd>{entry.path}</dd><dt>Kind</dt><dd>{entry.kind}</dd><dt>Representation</dt><dd>{representation(entry)}</dd><dt>Source pages</dt><dd>{pages(entry.source_pages)}</dd></dl>
        <div className="alageum-actions"><button type="button" disabled={disabled} aria-pressed={selectedId === entry.id} onClick={() => setSelectedId(entry.id)}>Preview reviewed image</button><button type="button" disabled={disabled || draft.length >= 50 || draft.some((row) => row.source.path === entry.path && row.source.kind === entry.kind)} onClick={() => update(addReviewedMedia(draft, entry.id, options))}>Attach reviewed image</button></div>
      </div>)}
      {selected && <Preview productId={productId} entry={selected} token={token} />}
      <button type="button" disabled={disabled} onClick={() => update(restoreReviewedMedia(options))}>Restore reviewed media</button>
      <p className="alageum-muted">Restore replaces the attachment draft with the reviewed array, including its exact alternative text values. Save product to apply it.</p>
    </section>}
  </details>;
}
