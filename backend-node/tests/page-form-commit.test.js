"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nativePageForm } = require("./helpers/native-page-form");

const paragraph = text => [{ type: "paragraph", children: [{ type: "text", text }] }];
const previous = paragraph("Previous saved body");
const initialValues = () => ({ title: "Page title", body: structuredClone(previous) });

function fixture(t, options = {}) {
  const native = nativePageForm({ initialValues: initialValues(), ...options });
  t.after(() => {
    native.close();
    assert.deepEqual(native.warnings, [], "no React render/effect/ref/lifecycle warnings");
  });
  return native;
}

test("real ReactDOM and native Form expose stale publish values with only livePreviewSync", async t => {
  const native = fixture(t, { mode: "native" });
  // Slate invokes its AST callback in a Promise microtask. The ordinary form
  // dispatch receives React's default priority, not the preceding DOM event's.
  await Promise.resolve();
  native.change(paragraph(""));
  const read = await native.publishRead();
  assert.deepEqual(read.validation.data.body, previous);
  assert.deepEqual(read.values.body, previous);
  assert.equal(native.timerRequests, 0, "staleness occurs after the native debounce is already removed");
});

test("actual Page adapter commits native empty normalization and final characters before publish reads", async t => {
  const native = fixture(t);
  for (const text of ["", "Final character!", "", "Latest", "Latest!!", ""]) {
    await Promise.resolve();
    native.change(paragraph(text));
    const expected = text ? paragraph(text) : null;
    assert.deepEqual(native.form.getValues().body, expected, "the callback returns after committing this edit");
    const read = await native.publishRead();
    assert.deepEqual(read.validation.data.body, expected);
    assert.deepEqual(read.values.body, expected);
    assert.equal(native.timerRequests, 0);
    assert.equal(native.pendingTimers, 0);
  }
  assert.equal(native.mounts, 1, "own form echoes do not remount the controlled Slate host");
});

test("Page commit wrapper preserves native props, custom callback and imperative ref", async t => {
  const calls = [];
  let native;
  const onBlur = () => {};
  const onFocus = () => {};
  const onChange = (...args) => { calls.push(args); native.form.onChange(...args); };
  native = fixture(t, { inputProps: { disabled: true, required: true, label: "Body", hint: "Hint",
    onBlur, onFocus, onChange, placeholder: "Write a body" }, initialErrors: { body: "Field error" } });
  assert.equal(native.editorProps.disabled, true);
  assert.equal(native.editorProps.onBlur, onBlur);
  assert.equal(native.editorProps.onFocus, onFocus);
  assert.equal(native.editorProps.placeholder, "Write a body");
  assert.equal(native.editorProps.livePreviewSync, true);
  assert.equal(native.editorProps.error, "Field error");
  assert.equal(native.fieldProps.required, true);
  assert.equal(native.fieldProps.hint, "Hint");
  assert.equal(typeof native.inputRef.current.focus, "function");
  const callback = native.editorProps.onChange;
  await Promise.resolve();
  native.change(paragraph("Custom callback's final character!"));
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "body");
  assert.deepEqual(native.form.getValues().body, calls[0][1]);
  assert.equal(native.editorProps.onChange, callback, "wrapper callback stays stable across form echoes");
});

test("commit behavior stays scoped to the Page body and preserves other fields' callback identity", async t => {
  for (const [model, name] of [["api::article.article", "body"], ["api::page.page", "summary"]]) {
    const native = fixture(t, { model, name, initialValues: { [name]: structuredClone(previous) },
      inputProps: { livePreviewSync: true } });
    assert.equal(native.editorProps.onChange, native.form.onChange, "other fields keep the native callback");
    await Promise.resolve();
    native.change(paragraph(""));
    const read = await native.publishRead();
    assert.deepEqual(read.values[name], previous, "the app did not silently opt this field into flushSync");
    native.close();
    assert.deepEqual(native.warnings, []);
  }
});

test("native Page callbacks preserve reset and unmount without delayed body resurrection", async t => {
  const native = fixture(t);
  await Promise.resolve();
  native.change(paragraph("Discard this edit"));
  native.change(paragraph(""));
  native.change(paragraph("Discard this later edit too"));
  const reset = { title: "Reset title", body: paragraph("Server reset") };
  await native.reset(reset);
  await Promise.resolve();
  assert.deepEqual(native.form.getValues(), reset);
  assert.deepEqual(native.editorChildren, reset.body, "native reset effects reinitialize the controlled Slate host");
  assert.equal(native.pendingTimers, 0);
  assert.equal(native.timerRequests, 0, "no deferred native body callback can outlive reset or unmount");
  const getValues = native.form.getValues;
  native.close();
  await Promise.resolve();
  assert.deepEqual(getValues(), reset);
  assert.equal(native.inputRef.current, null);
  assert.deepEqual(native.warnings, []);
});
