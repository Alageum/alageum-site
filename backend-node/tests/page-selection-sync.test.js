"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { Node } = require("slate");
const { nativePageBeforeInput, fullRange, paragraph } = require("./helpers/native-page-beforeinput");

const point = (offset, path = [0, 0]) => ({ path, offset });
const range = (start, end = start) => ({ anchor: point(start), focus: point(end) });
const eventKinds = fixture => fixture.trace.map(event => event.kind);
const deletion = fixture => fixture.trace.filter(event => /^delete/.test(event.kind));

for (const variant of ["commonjs", "esm"]) {
  test(`${variant}: unchanged native handler reproduces the null/stale-selection deletion failure`, async t => {
    for (const [selection, text, method] of [[null, "abcdef", "deleteForward"],
      [range(2), "abdef", "deleteForward"], [range(6), "abcdef", "deleteForward"],
      [range(1, 3), "adef", "deleteFragment"]]) {
      const fixture = nativePageBeforeInput({ variant, selection });
      t.after(() => fixture.close());
      fixture.nativeInput();
      await Promise.resolve();
      assert.equal(Node.string(fixture.editor), text);
      assert.equal(deletion(fixture)[0].kind, method);
      assert.equal(fixture.event.defaultPrevented, true);
      assert.equal(eventKinds(fixture).includes("map-dom-selection"), false,
        "native delete does not map the visible selection when selectionchange has not arrived");
    }
  });

  for (const inputType of ["deleteContentForward", "deleteContentBackward"]) {
    test(`${variant}: capture reconciliation lets native ${inputType} clear null, stale, and selected ranges`, async t => {
      for (const selection of [null, range(2), range(6), range(1, 3), range(0, 6)]) {
        const fixture = nativePageBeforeInput({ variant, inputType, selection });
        t.after(() => fixture.close());
        const before = structuredClone(fixture.editor.children);
        const result = fixture.reconcile();
        assert.equal(result.status, selection && selection.anchor.offset === 0 ? "unchanged" : "reconciled");
        assert.deepEqual(fixture.editor.children, before, "capture never writes content");
        assert.deepEqual(fixture.editor.selection, fullRange(before));
        assert.equal(fixture.event.defaultPrevented, false, "only the native handler cancels input");
        assert.ok(fixture.operations.every(operation => operation.type === "set_selection"));
        assert.equal(fixture.operations.length, result.status === "unchanged" ? 0 : 1);
        assert.equal(fixture.pendingTimers, 0);
        assert.deepEqual(fixture.changes, []);

        fixture.nativeInput();
        await Promise.resolve();
        assert.equal(Node.string(fixture.editor), "");
        assert.deepEqual(fixture.changes, [{ name: "body", value: null }],
          "the installed Strapi callback normalizes the real Slate empty state");
        assert.equal(fixture.event.defaultPrevented, true);
        const kinds = eventKinds(fixture);
        assert.ok(kinds.indexOf("capture-exit") < kinds.indexOf("native-enter"));
        assert.ok(kinds.indexOf("native-enter") < kinds.indexOf("schedule-flush"));
        assert.ok(kinds.indexOf("schedule-flush") < kinds.indexOf("selection-flush"));
        assert.ok(kinds.indexOf("selection-flush") < kinds.indexOf("prevent-default"));
        assert.ok(kinds.indexOf("prevent-default") < kinds.indexOf("deleteFragment"));
        assert.ok(kinds.indexOf("native-exit") < kinds.indexOf("form-change"));
        assert.deepEqual(deletion(fixture).map(event => [event.kind, event.args]),
          [["deleteFragment", [{ direction: inputType.endsWith("Backward") ? "backward" : "forward" }]]]);
        assert.equal(fixture.pendingTimers, 0);
      }
    });
  }
}

test("multi-paragraph marked content retains native undo/redo and selection-only callbacks stay silent", async t => {
  const body = [
    { type: "paragraph", children: [{ type: "text", text: "bold ", bold: true }, { type: "text", text: "plain" }] },
    { type: "paragraph", children: [{ type: "text", text: "italic", italic: true }] },
  ];
  for (const inputType of ["deleteContentForward", "deleteContentBackward"]) {
    const fixture = nativePageBeforeInput({ body, inputType });
    t.after(() => fixture.close());
    // Preserve a backwards browser selection through conversion and history.
    const selected = fullRange(body);
    fixture.controls.mappedRange = { anchor: selected.focus, focus: selected.anchor };
    assert.equal(fixture.reconcile().status, "reconciled");
    assert.deepEqual(fixture.editor.children, body);
    await Promise.resolve();
    assert.deepEqual(fixture.changes, [], "native callback ignores the helper's selection operation");
    assert.equal(fixture.editor.history.undos.length, 0, "selection repair adds no undo item");
    fixture.nativeInput();
    await Promise.resolve();
    assert.equal(Node.string(fixture.editor), "");
    assert.deepEqual(fixture.changes.at(-1), { name: "body", value: null });
    assert.equal(fixture.editor.children[0].children[0].type, "text", "native Strapi schema is retained");
    assert.equal(fixture.editor.history.undos.length, 1);
    fixture.editor.undo();
    await Promise.resolve();
    assert.deepEqual(fixture.editor.children, body);
    assert.deepEqual(fixture.editor.selection, fixture.controls.mappedRange);
    assert.deepEqual(fixture.changes.at(-1), { name: "body", value: body });
    fixture.editor.redo();
    await Promise.resolve();
    assert.equal(Node.string(fixture.editor), "");
    assert.deepEqual(fixture.changes.at(-1), { name: "body", value: null });
  }
});

test("selected portion, rather than all content, is what the unchanged native handler deletes", async t => {
  const fixture = nativePageBeforeInput({ body: paragraph("abcdef"), selection: range(0) });
  t.after(() => fixture.close());
  fixture.controls.mappedRange = range(1, 4);
  assert.equal(fixture.reconcile().status, "reconciled");
  fixture.nativeInput();
  await Promise.resolve();
  assert.deepEqual(fixture.editor.children, paragraph("aef"));
  assert.deepEqual(fixture.changes, [{ name: "body", value: paragraph("aef") }]);
});

test("already queued native selection work still flushes in its normal order", async t => {
  const fixture = nativePageBeforeInput();
  t.after(() => fixture.close());
  fixture.queueSelectionChange();
  assert.equal(fixture.pendingTimers, 1);
  assert.equal(fixture.reconcile().status, "reconciled");
  fixture.nativeInput();
  await Promise.resolve();
  assert.equal(Node.string(fixture.editor), "");
  assert.deepEqual(fixture.changes, [{ name: "body", value: null }]);
  assert.equal(fixture.operations.filter(operation => operation.type === "set_selection").length, 1,
    "native queued conversion is idempotent with the reconciled range");
});

test("an incorrect collapsed flag cannot discard an expanded DOM range", async t => {
  const fixture = nativePageBeforeInput();
  t.after(() => fixture.close());
  // The pinned native converter documents this Chromium ShadowRoot quirk.
  // DOM mappings remain controlled here; this is not a shadow-browser test.
  fixture.domSelection.isCollapsed = true;
  assert.equal(fixture.domRange.collapsed, false);
  assert.notEqual(fixture.domSelection.anchorNode, fixture.domSelection.focusNode);
  assert.equal(fixture.reconcile().status, "reconciled");
  fixture.nativeInput();
  await Promise.resolve();
  assert.equal(Node.string(fixture.editor), "");
  assert.deepEqual(fixture.changes, [{ name: "body", value: null }]);
});

const exclusions = [
  ["other event", fixture => { fixture.event.type = "keydown"; }, "unsupported-event"],
  ["text insertion", fixture => { fixture.event.inputType = "insertText"; }, "unsupported-event"],
  ["word deletion", fixture => { fixture.event.inputType = "deleteWordForward"; }, "unsupported-event"],
  ["composition deletion", fixture => { fixture.event.inputType = "deleteCompositionText"; }, "unsupported-event"],
  ["cut deletion", fixture => { fixture.event.inputType = "deleteByCut"; }, "unsupported-event"],
  ["untrusted event", fixture => { fixture.event.isTrusted = false; }, "inactive-event"],
  ["uncancelable input manager event", fixture => { fixture.event.cancelable = false; }, "inactive-event"],
  ["already canceled event", fixture => { fixture.event.defaultPrevented = true; }, "inactive-event"],
  ["DOM composition", fixture => { fixture.event.isComposing = true; }, "composing"],
  ["Slate composition", fixture => { fixture.controls.composing = true; }, "composing"],
  ["read-only editor", fixture => { fixture.controls.readOnly = true; }, "read-only"],
  ["detached root", fixture => { fixture.root.isConnected = false; }, "root-mismatch"],
  ["noneditable root", fixture => { fixture.attributes.contenteditable = "false"; }, "root-mismatch"],
  ["inherited noneditable root", fixture => { fixture.root.isContentEditable = false; }, "root-mismatch"],
  ["non-Slate root", fixture => { fixture.attributes["data-slate-editor"] = "false"; }, "root-mismatch"],
  ["different target", fixture => { fixture.event.target = fixture.outside; }, "root-mismatch"],
  ["nested target", fixture => { fixture.event.target = fixture.domSelection.anchorNode; }, "root-mismatch"],
  ["different editor host", fixture => { fixture.controls.liveRoot = fixture.outside; }, "root-mismatch"],
  ["unfocused root", fixture => { fixture.documentRoot.activeElement = fixture.outside; }, "inactive-root"],
  ["missing selection", fixture => { fixture.controls.selection = null; }, "no-expanded-dom-range"],
  ["empty selection", fixture => { fixture.domSelection.rangeCount = 0; }, "no-expanded-dom-range"],
  ["multiple ranges", fixture => { fixture.domSelection.rangeCount = 2; }, "no-expanded-dom-range"],
  ["equal selection points", fixture => {
    fixture.domSelection.focusNode = fixture.domSelection.anchorNode;
    fixture.domSelection.focusOffset = fixture.domSelection.anchorOffset;
  }, "no-expanded-dom-range"],
  ["collapsed DOM range", fixture => { fixture.domRange.collapsed = true; }, "outside-root"],
  ["outside anchor", fixture => { fixture.domSelection.anchorNode = fixture.outside; }, "outside-root"],
  ["outside focus", fixture => { fixture.domSelection.focusNode = fixture.outside; }, "outside-root"],
  ["outside range boundary", fixture => { fixture.domRange.endContainer = fixture.outside; }, "outside-root"],
  ["outside common ancestor", fixture => { fixture.domRange.commonAncestorContainer = fixture.outside; }, "outside-root"],
  ["noneditable endpoint", fixture => { fixture.domSelection.focusNode.editable = false; }, "outside-root"],
  ["nested editor endpoint", fixture => { fixture.domSelection.focusNode.editorRoot = fixture.outside; }, "outside-root"],
  ["null conversion", fixture => { fixture.controls.mappedRange = null; }, "invalid-slate-range"],
  ["malformed conversion", fixture => { fixture.controls.mappedRange = {}; }, "invalid-slate-range"],
  ["collapsed conversion", fixture => { fixture.controls.mappedRange = range(2); }, "invalid-slate-range"],
  ["missing Slate path", fixture => { fixture.controls.mappedRange.focus.path = [10, 0]; }, "invalid-slate-range"],
  ["element Slate point", fixture => { fixture.controls.mappedRange.focus.path = [0]; }, "invalid-slate-range"],
  ["out-of-bounds Slate offset", fixture => { fixture.controls.mappedRange.focus.offset = 7; }, "invalid-slate-range"],
  ["negative Slate offset", fixture => { fixture.controls.mappedRange.anchor.offset = -1; }, "invalid-slate-range"],
  ["fractional Slate offset", fixture => { fixture.controls.mappedRange.anchor.offset = 0.5; }, "invalid-slate-range"],
  ["throwing conversion", fixture => { fixture.controls.mappingThrows = true; }, "unavailable-dom-mapping"],
  ["remount during conversion", fixture => {
    fixture.controls.afterMapping = () => { fixture.controls.liveRoot = fixture.outside; };
  }, "root-mismatch"],
  ["focus change during conversion", fixture => {
    fixture.controls.afterMapping = () => { fixture.documentRoot.activeElement = fixture.outside; };
  }, "root-mismatch"],
];

for (const [name, mutate, reason] of exclusions) {
  test(`skip ${name} without content, selection, cancellation, or scheduling changes`, async t => {
    const fixture = nativePageBeforeInput({ selection: range(2) });
    t.after(() => fixture.close());
    mutate(fixture);
    const before = structuredClone({ selection: fixture.editor.selection, children: fixture.editor.children,
      defaultPrevented: fixture.event.defaultPrevented });
    assert.deepEqual(fixture.reconcile(), { status: "skipped", reason });
    assert.deepEqual({ selection: fixture.editor.selection, children: fixture.editor.children,
      defaultPrevented: fixture.event.defaultPrevented }, before);
    assert.deepEqual(fixture.operations, []);
    assert.equal(fixture.pendingTimers, 0);
    await Promise.resolve();
    assert.deepEqual(fixture.changes, []);
  });
}

test("missing and disabled ownership are rejected and every event rechecks mutable root ownership", t => {
  const fixture = nativePageBeforeInput();
  t.after(() => fixture.close());
  for (const overrides of [{ event: null }, { editor: null }, { root: null }, { disabled: true }]) {
    assert.equal(fixture.reconcile(overrides).status, "skipped");
  }
  assert.equal(fixture.reconcile().status, "reconciled");
  const count = fixture.operations.length;
  fixture.controls.liveRoot = fixture.outside;
  assert.deepEqual(fixture.reconcile(), { status: "skipped", reason: "root-mismatch" });
  assert.equal(fixture.operations.length, count);
});

test("collapsed DOM selection keeps native single-character deletion behavior", async t => {
  const fixture = nativePageBeforeInput({ selection: range(2) });
  t.after(() => fixture.close());
  fixture.domSelection.isCollapsed = true;
  fixture.domSelection.focusNode = fixture.domSelection.anchorNode;
  fixture.domSelection.focusOffset = fixture.domSelection.anchorOffset;
  fixture.domRange.collapsed = true;
  assert.equal(fixture.reconcile().status, "skipped");
  fixture.nativeInput();
  await Promise.resolve();
  assert.equal(Node.string(fixture.editor), "abdef");
  assert.equal(deletion(fixture)[0].kind, "deleteForward");
});

test("mapping failure leaves the original native deletion path intact", async t => {
  const fixture = nativePageBeforeInput();
  t.after(() => fixture.close());
  fixture.controls.mappingThrows = true;
  assert.equal(fixture.reconcile().reason, "unavailable-dom-mapping");
  fixture.nativeInput();
  await Promise.resolve();
  assert.equal(Node.string(fixture.editor), "abcdef");
  assert.equal(deletion(fixture)[0].kind, "deleteForward");
  assert.deepEqual(fixture.changes, []);
});
