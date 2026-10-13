"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readCatalog } = require("../src/domain/catalog-source");
const model = import("../src/plugins/alageum-catalog/admin/src/media-draft.mjs");
const optionsFor = (media) => ({ reviewed: structuredClone(media), entries: media.map((item, index) => ({ id: `entry-${index}`, path: item.path, kind: item.kind, representation: "crop", source_pages: [3], mime: "image/png" })) });

test("all released imported media arrays roundtrip without normalizing alternative text", async () => {
  const { createMediaDraft, serializeMediaDraft } = await model;
  const records = readCatalog();
  const expected = require("../data/catalog-release.json").recordCount;
  assert.equal(records.length, expected);
  for (const record of records) {
    const media = record.image ? [{ path: record.image, kind: "image", alt: record.imageCaption || "" }] : [];
    const result = serializeMediaDraft(createMediaDraft(media), optionsFor(media));
    assert.deepEqual(result, { media, errors: {} }, record.id);
  }
});

test("unmodified and reordered rows preserve absent, null, empty and literal alt distinctly", async () => {
  const { createMediaDraft, serializeMediaDraft, moveMedia, changeMediaAlt } = await model;
  const media = [
    { path: "/one.png", kind: "image" },
    { path: "/two.png", kind: "image", alt: null },
    { path: "/three.png", kind: "image", alt: "" },
    { path: "/four.png", kind: "image", alt: "  Блок\n002  " },
  ];
  const options = optionsFor(media);
  let draft = createMediaDraft(media);
  assert.deepEqual(serializeMediaDraft(draft, options), { media, errors: {} });
  draft = moveMedia(draft, 3, -1);
  assert.deepEqual(serializeMediaDraft(draft, options).media, [media[0], media[1], media[3], media[2]]);
  draft = changeMediaAlt(draft, 1, { mode: "text", input: "Edited description" }, options);
  assert.deepEqual(serializeMediaDraft(draft, options).media, [media[0], { ...media[1], alt: "Edited description" }, media[3], media[2]]);
  assert.equal(Object.hasOwn(media[0], "alt"), false);
  assert.equal(media[1].alt, null, "the API response is never mutated");
});

test("explicit alt state changes can remove a property, set null or save empty text", async () => {
  const { createMediaDraft, serializeMediaDraft, changeMediaAlt } = await model;
  const media = [{ path: "/image.png", kind: "image", alt: "Existing description" }];
  const options = optionsFor(media);
  for (const [mode, expected] of [["absent", { path: "/image.png", kind: "image" }], ["null", { ...media[0], alt: null }], ["text", { ...media[0], alt: "" }]]) {
    const draft = changeMediaAlt(createMediaDraft(media), 0, { mode, input: "" }, options);
    assert.deepEqual(serializeMediaDraft(draft, options), { media: [expected], errors: {} });
  }
});

test("an untouched media draft adds no media property to create or update bodies", async () => {
  const { createMediaDraft, mediaPatch } = await model;
  for (const media of [[], [{ path: "/legacy.png", kind: "image", alt: null }]]) {
    const draft = createMediaDraft(media);
    assert.deepEqual(mediaPatch(draft, false, null), { body: {}, errors: {} });
    assert.equal(Object.hasOwn(mediaPatch(draft, false, null).body, "media"), false);
    assert.deepEqual(mediaPatch([], true, optionsFor([])), { body: { media: [] }, errors: {} });
  }
});

test("the page39 legacy import cannot be edited or added; restore explicitly selects reviewed page38", async () => {
  const { createMediaDraft, serializeMediaDraft, reviewedEntry, changeMediaAlt, addReviewedMedia, restoreReviewedMedia, moveMedia, removeMedia } = await model;
  const imported = { path: "/catalog/page39-crop.png", kind: "image", alt: "Imported" };
  const reviewed = { path: "/catalog/page38-scan.png", kind: "image" };
  const options = { ...optionsFor([reviewed]), imported: [imported], baseline_override: true };
  const draft = createMediaDraft([imported, { path: "/legacy.pdf", kind: "document", alt: null }]);
  assert.equal(reviewedEntry(imported, options), null);
  assert.equal(changeMediaAlt(draft, 0, { mode: "text", input: "Changed" }, options)[0], draft[0]);
  draft[0].alt = { mode: "text", input: "Directly changed draft control" };
  assert.deepEqual(serializeMediaDraft(draft, options).media[0], imported, "legacy alt is protected at serialization too");
  const moved = moveMedia(draft, 0, 1);
  assert.deepEqual(serializeMediaDraft(moved, options).media, [draft[1].source, imported]);
  assert.deepEqual(serializeMediaDraft(removeMedia(moved, 1), options).media, [draft[1].source]);
  assert.equal(addReviewedMedia(draft, "unlisted-import", options), draft);
  assert.deepEqual(serializeMediaDraft(restoreReviewedMedia(options), options), { media: [reviewed], errors: {} });
  assert.deepEqual(serializeMediaDraft(addReviewedMedia([], "entry-0", options), options).media, [reviewed]);
});

test("attachment choices are product scoped, duplicate-safe and preserve restored metadata exactly", async () => {
  const { createMediaDraft, addReviewedMedia, restoreReviewedMedia, serializeMediaDraft, moveMedia } = await model;
  const media = [{ path: "/reviewed.png", kind: "image", alt: null }];
  const options = optionsFor(media);
  const draft = createMediaDraft(media);
  assert.equal(addReviewedMedia(draft, "entry-0", options), draft);
  assert.equal(addReviewedMedia([], "other-product-entry", options).length, 0);
  assert.equal(moveMedia(draft, 0, -1), draft);
  assert.equal(moveMedia(draft, 0, 1), draft);
  assert.equal(moveMedia(draft, -1, 1), draft);
  assert.deepEqual(serializeMediaDraft(restoreReviewedMedia(options), options), { media, errors: {} });
  assert.deepEqual(serializeMediaDraft(restoreReviewedMedia(optionsFor([])), optionsFor([])), { media: [], errors: {} });
});

test("invalid alt input reports its row and leaves the draft available after validation failure", async () => {
  const { createMediaDraft, serializeMediaDraft, changeMediaAlt } = await model;
  const media = [{ path: "/image.png", kind: "image" }];
  const options = optionsFor(media);
  const draft = changeMediaAlt(createMediaDraft(media), 0, { mode: "text", input: "x".repeat(1001) }, options);
  assert.ok(serializeMediaDraft(draft, options).errors["media.0.alt"]);
  assert.equal(draft[0].alt.input.length, 1001);
  draft[0].alt.mode = "number";
  assert.equal(serializeMediaDraft(draft, options).errors["media.0.alt"], "Choose an alternative text state");
});
