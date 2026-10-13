// Keep imported JSON separate from form controls so absent, null and empty alt
// text survive both unrelated saves and explicit attachment reordering.
export function createMediaDraft(media = []) {
  return media.map((item) => ({
    source: structuredClone(item),
    alt: { mode: !Object.hasOwn(item, "alt") ? "absent" : item.alt === null ? "null" : "text", input: typeof item.alt === "string" ? item.alt : "" },
  }));
}

export function reviewedEntry(item, options) {
  if (!options?.reviewed?.some((allowed) => allowed.path === item.path && allowed.kind === item.kind)) return null;
  return options.entries.find((entry) => entry.path === item.path && entry.kind === item.kind) || null;
}

export function changeMediaAlt(draft, index, alt, options) {
  return draft.map((row, i) => i === index && reviewedEntry(row.source, options) ? { ...row, alt: { ...alt } } : row);
}

export function removeMedia(draft, index) {
  return draft.filter((_, i) => i !== index);
}

export function moveMedia(draft, index, direction) {
  const target = index + direction;
  if (![1, -1].includes(direction) || index < 0 || index >= draft.length || target < 0 || target >= draft.length) return draft;
  const next = [...draft];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function addReviewedMedia(draft, entryId, options) {
  const entry = options?.entries?.find((item) => item.id === entryId);
  const reviewed = entry && options.reviewed.find((item) => item.path === entry.path && item.kind === entry.kind);
  if (!reviewed || draft.length >= 50 || draft.some((row) => row.source.path === reviewed.path && row.source.kind === reviewed.kind)) return draft;
  return [...draft, ...createMediaDraft([reviewed])];
}

export function restoreReviewedMedia(options) {
  return createMediaDraft(options.reviewed);
}

export function serializeMediaDraft(draft, options) {
  const errors = {};
  if (draft.length > 50) errors.media = "Use at most 50 attachments";
  const media = draft.map((row, index) => {
    const item = structuredClone(row.source);
    // Legacy attachments can only be retained, removed or reordered. In
    // particular, the imported page39 exception must not become an alt edit.
    if (!reviewedEntry(item, options)) return item;
    if (row.alt.mode === "absent") delete item.alt;
    else if (row.alt.mode === "null") item.alt = null;
    else if (row.alt.mode === "text" && typeof row.alt.input === "string") {
      item.alt = row.alt.input;
      if (item.alt.length > 1000) errors[`media.${index}.alt`] = "Use at most 1000 characters for alternative text";
    } else errors[`media.${index}.alt`] = "Choose an alternative text state";
    return item;
  });
  return { media, errors };
}

export function mediaPatch(draft, dirty, options) {
  if (!dirty) return { body: {}, errors: {} };
  const { media, errors } = serializeMediaDraft(draft, options);
  return { body: { media }, errors };
}
