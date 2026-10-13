"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nativeBlocksCallback } = require("./helpers/native-blocks-callback");

const options = import("../src/admin/page-editor-options.mjs");
const paragraph = text => [{ type: "paragraph", children: [{ type: "text", text }] }];
const selection = { type: "set_selection", properties: null, newProperties: null };

test("Page body options preserve caller props and select synchronous native input only for that field", async () => {
  const { pageEditorInputProps } = await options;
  const onBlur = () => {};
  const props = Object.freeze({ name: "body", disabled: true, required: true, label: "Body", onBlur,
    attribute: Object.freeze({ type: "blocks" }), livePreviewSync: false });
  const result = pageEditorInputProps("api::page.page", props);
  assert.deepEqual(result, { ...props, livePreviewSync: true });
  assert.equal(result.onBlur, onBlur);
  assert.equal(result.attribute, props.attribute);
  assert.equal(props.livePreviewSync, false, "input props are not mutated");

  for (const [model, name] of [["api::page.page", "summary"], ["api::page.page", "section.body"],
    ["api::article.article", "body"], [undefined, "body"]]) {
    for (const flag of [undefined, false, true]) {
      const otherProps = { ...props, name };
      if (flag === undefined) delete otherProps.livePreviewSync;
      else otherProps.livePreviewSync = flag;
      assert.deepEqual(pageEditorInputProps(model, otherProps), otherProps,
        `${model}/${name} retains the caller's synchronization setting`);
    }
  }
});

test("actual pinned Page BlocksEditor delivers rapid successive edits and clear without any pending debounce", async () => {
  const { pageEditorInputProps } = await options;
  const native = nativeBlocksCallback(pageEditorInputProps("api::page.page", { name: "body" }));
  const states = [paragraph("first"), paragraph("second with a final character!"), paragraph("")];
  for (const [index, state] of states.entries()) {
    native.change(state);
    assert.equal(native.changes.length, index + 1, "the native callback delivers this edit immediately");
    assert.equal(native.pendingTimers, 0, "no timer remains to overwrite later form state");
  }
  assert.deepEqual(native.changes, [
    { name: "body", value: states[0], at: 0 },
    { name: "body", value: states[1], at: 0 },
    { name: "body", value: null, at: 0 },
  ]);
  native.replaceEditorChildren(paragraph("external reset"));
  native.advance(1000);
  assert.equal(native.changes.length, 3, "no delayed callback revives pre-reset content");
});

test("actual pinned synchronous callback preserves structured Blocks content", async () => {
  const { pageEditorInputProps } = await options;
  const native = nativeBlocksCallback(pageEditorInputProps("api::page.page", { name: "body" }));
  const state = [
    { type: "heading", level: 2, children: [{ type: "text", text: "Heading", bold: true }] },
    { type: "list", format: "unordered", children: [
      { type: "list-item", children: [{ type: "text", text: "Item", italic: true }] },
    ] },
  ];
  native.change(state, { type: "insert_node", path: [1], node: state[1] });
  assert.deepEqual(native.changes, [{ name: "body", value: state, at: 0 }]);
  assert.equal(native.pendingTimers, 0);
});

test("actual native callbacks ignore selection-only changes in both synchronization modes", () => {
  for (const livePreviewSync of [false, true]) {
    const native = nativeBlocksCallback({ livePreviewSync });
    native.change(paragraph("unchanged"), selection);
    assert.deepEqual(native.changes, []);
    assert.equal(native.pendingTimers, 0);
    native.advance(1000);
    assert.deepEqual(native.changes, []);
  }
});

test("unchanged native debounced mode delays body and retains the last pre-reset AST", () => {
  const native = nativeBlocksCallback({ livePreviewSync: false });
  native.change(paragraph("superseded"));
  native.advance(50);
  const latest = paragraph("last typed value");
  native.change(latest);
  native.change(latest, selection);
  assert.deepEqual(native.changes, [], "the form has not received the typed body");
  assert.equal(native.pendingTimers, 1, "rapid edits replace the previous debounce");
  native.advance(299);
  assert.deepEqual(native.changes, []);
  native.replaceEditorChildren(paragraph("external reset"));
  native.advance(1);
  assert.deepEqual(native.changes, [{ name: "body", value: latest, at: 350 }],
    "the native scheduled callback closes over pre-reset input, not current editor children");
  assert.equal(native.pendingTimers, 0);
});
