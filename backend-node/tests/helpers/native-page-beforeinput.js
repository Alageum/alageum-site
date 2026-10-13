"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { parse } = require("@babel/parser");
const { transformSync } = require("esbuild");
const slate = require("slate");
const { withReact } = require("slate-react");
const { withHistory } = require("slate-history");
const lodash = require("lodash");

const blocksRoot = path.join(path.dirname(require.resolve("@strapi/content-manager/package.json")),
  "dist/admin/pages/EditView/components/FormInputs/BlocksInput");
const { withStrapiSchema } = require(path.join(blocksRoot, "plugins/withStrapiSchema.js"));
const clone = value => structuredClone(value);

function sourceVariables(filename, names) {
  const source = fs.readFileSync(filename, "utf8");
  const ast = parse(source, { sourceType: "unambiguous" });
  const variables = new Map(names.map(name => [name, []]));
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "VariableDeclarator" && variables.has(node.id.name)) {
      // These two variables also occur inside hooks other than Editable.
      if (!["onDOMSelectionChange", "scheduleOnDOMSelectionChange"].includes(node.id.name)
        || (node.init?.callee?.property?.name ?? node.init?.callee?.name) === "useMemo") {
        variables.get(node.id.name).push(node.init);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["loc", "start", "end", "extra"].includes(key)) continue;
      if (Array.isArray(value)) value.forEach(visit);
      else visit(value);
    }
  }
  visit(ast);
  return Object.fromEntries([...variables].map(([name, nodes]) => {
    assert.equal(nodes.length, 1, `one installed ${name} in ${filename}`);
    const node = ["onDOMBeforeInput", "onDOMSelectionChange", "scheduleOnDOMSelectionChange", "handleSlateChange"]
      .includes(name) ? nodes[0].arguments[0] : nodes[0];
    return [name, source.slice(node.start, node.end)];
  }));
}

const sources = Object.fromEntries(["commonjs", "esm"].map(variant => {
  const slateFile = variant === "esm"
    ? path.join(path.dirname(require.resolve("slate-react")), "index.es.js") : require.resolve("slate-react");
  const blocksFile = path.join(blocksRoot, variant === "esm" ? "BlocksEditor.mjs" : "BlocksEditor.js");
  return [variant, {
    ...sourceVariables(slateFile, ["onDOMBeforeInput", "onDOMSelectionChange", "scheduleOnDOMSelectionChange", "isDOMEventHandled"]),
    ...sourceVariables(blocksFile, ["normalizeBlocksState", "handleSlateChange"]),
  }];
}));

const applicationSource = transformSync(fs.readFileSync(path.resolve(__dirname,
  "../../src/admin/page-selection-sync.mjs"), "utf8"), { format: "cjs", loader: "js" }).code;

const paragraph = text => [{ type: "paragraph", children: [{ type: "text", text }] }];
const fullRange = body => {
  const editor = slate.createEditor();
  editor.children = body;
  return slate.Editor.range(editor, []);
};

// Focused native-handler fixture, not a DOM/browser/keyboard simulation. The
// installed ESM/CJS beforeinput, selection scheduling and Strapi callbacks are
// extracted unchanged. Slate editing/history/schema normalization and lodash
// throttle/debounce are real. DOM nodes, InputEvent, ReactEditor DOM mappings,
// the clock, and Form callback delivery are controlled explicit boundaries.
function nativePageBeforeInput({ body = paragraph("abcdef"), selection = null,
  inputType = "deleteContentForward", variant = "esm", readOnly = false,
  composing = false, disabled = false } = {}) {
  assert.equal(require("@strapi/content-manager/package.json").version, "5.56.0");
  assert.equal(require("slate-react/package.json").version, "0.98.4");
  const trace = [], operations = [], changes = [];
  const emit = (kind, detail = {}) => trace.push({ kind, ...detail });
  const editor = withReact(withStrapiSchema(withHistory(slate.createEditor())));
  editor.children = clone(body);
  editor.selection = clone(selection);
  const apply = editor.apply;
  editor.apply = operation => {
    operations.push(clone(operation));
    emit("apply", { type: operation.type });
    return apply(operation);
  };
  for (const method of ["deleteFragment", "deleteForward", "deleteBackward"]) {
    const original = editor[method];
    editor[method] = (...args) => {
      emit(method, { args: clone(args), selection: clone(editor.selection) });
      return original(...args);
    };
  }

  const attributes = { "data-slate-editor": "true", contenteditable: "true" };
  const root = { nodeType: 1, isConnected: true, isContentEditable: true,
    getAttribute: name => attributes[name] ?? null,
    contains(node) {
      for (let current = node; current; current = current.parentNode) if (current === this) return true;
      return false;
    },
  };
  root.editorRoot = root;
  const anchorNode = { nodeType: 3, parentNode: root, editorRoot: root, editable: true };
  const focusNode = { nodeType: 3, parentNode: root, editorRoot: root, editable: true };
  const outside = { nodeType: 3, editorRoot: null, editable: true };
  const domRange = { collapsed: false, startContainer: anchorNode, endContainer: focusNode,
    commonAncestorContainer: root };
  const domSelection = { rangeCount: 1, isCollapsed: false, anchorNode, anchorOffset: 0,
    focusNode, focusOffset: 6, getRangeAt: () => domRange };
  const controls = { liveRoot: root, readOnly, composing, mappedRange: fullRange(body),
    mappingThrows: false, afterMapping: null, customHandled: undefined, selection: domSelection };
  const documentRoot = { activeElement: root, getSelection: () => controls.selection };
  root.ownerDocument = documentRoot;
  const ReactEditor = {
    isReadOnly: () => controls.readOnly,
    isComposing: () => controls.composing,
    toDOMNode(owner, node) {
      assert.equal(owner, editor);
      assert.equal(node, editor);
      return controls.liveRoot;
    },
    findDocumentOrShadowRoot: () => documentRoot,
    hasDOMNode: (owner, node, options) => owner === editor && root.contains(node)
      && node.editorRoot === root && (!options?.editable || node.editable !== false),
    hasEditableTarget: (owner, node) => ReactEditor.hasDOMNode(owner, node, { editable: true }),
    isTargetInsideNonReadonlyVoid: () => false,
    hasRange: (_owner, range) => slate.Editor.hasPath(editor, range.anchor.path)
      && slate.Editor.hasPath(editor, range.focus.path),
    toSlateRange(owner, actualSelection, options) {
      assert.equal(owner, editor);
      assert.equal(actualSelection, controls.selection, "convert the current selection, never the event target range");
      assert.deepEqual({ ...options }, { exactMatch: false, suppressThrow: true });
      emit("map-dom-selection");
      if (controls.mappingThrows) throw new Error("controlled unavailable mapping");
      controls.afterMapping?.();
      return clone(controls.mappedRange);
    },
  };
  const module = { exports: {} };
  vm.compileFunction(applicationSource, ["exports", "require", "module"])(module.exports,
    name => name === "slate-react" ? { ReactEditor } : name === "slate" ? slate : assert.fail(name), module);
  const { reconcileExpandedPageSelection } = module.exports;

  const timers = new Map();
  let timerId = 0;
  class FixedDate extends Date { static now() { return 1000; } }
  const setTimer = (fn, delay) => { const id = ++timerId; timers.set(id, { fn, delay }); return id; };
  const clearTimer = id => timers.delete(id);
  const controlledLodash = lodash.runInContext({ Date: FixedDate, setTimeout: setTimer, clearTimeout: clearTimer });
  const context = vm.createContext({
    ...slate, slate, ReactEditor, editor, readOnly,
    state: { isUpdatingSelection: false, isDraggingInternally: false }, IS_ANDROID: false,
    IS_FOCUSED: new WeakMap(), IS_COMPOSING: new WeakMap(), EDITOR_TO_USER_SELECTION: new WeakMap(),
    androidInputManagerRef: { current: null }, onUserInput: () => emit("native-user-input"),
    propsOnDOMBeforeInput: () => controls.customHandled,
    throttle: controlledLodash.throttle, debounce: controlledLodash.debounce,
    throttle__default: { default: controlledLodash.throttle }, debounce__default: { default: controlledLodash.debounce },
    _slicedToArray: (value, count) => Array.from(value).slice(0, count),
    setIsComposing() {}, deferredOperations: { current: [] },
    debounceTimeout: { current: null }, livePreviewSync: true, name: "body",
    incrementSlateUpdatesCount: () => emit("native-ast-change"),
    onChange(name, value) { changes.push({ name, value: clone(value) }); emit("form-change"); },
    setTimeout: setTimer, clearTimeout: clearTimer,
  });
  const evaluate = source => vm.runInContext(`(${source})`, context);
  const native = sources[variant];
  context.isDOMEventHandled = evaluate(native.isDOMEventHandled);
  context.normalizeBlocksState = evaluate(native.normalizeBlocksState);
  const handleSlateChange = evaluate(native.handleSlateChange);
  editor.onChange = () => handleSlateChange(editor.children);
  const onSelection = evaluate(native.onDOMSelectionChange)();
  context.onDOMSelectionChange = onSelection;
  const schedule = evaluate(native.scheduleOnDOMSelectionChange)();
  context.scheduleOnDOMSelectionChange = schedule;
  for (const [name, callback] of [["schedule-flush", schedule], ["selection-flush", onSelection]]) {
    const flush = callback.flush;
    callback.flush = () => { emit(name); return flush(); };
  }
  const handler = evaluate(native.onDOMBeforeInput);
  // isTrusted is a fixture property; this does not claim browser-dispatched input.
  const event = { type: "beforeinput", inputType, isTrusted: true, cancelable: true,
    isComposing: composing, target: root, defaultPrevented: false, data: null,
    preventDefault() { this.defaultPrevented = true; emit("prevent-default"); },
    stopPropagation() { assert.fail("the adapter must not stop native event propagation"); },
    getTargetRanges() { assert.fail("forward/backward deletion must not read target ranges"); },
  };

  return {
    editor, event, root, outside, attributes, controls, documentRoot, domSelection, domRange,
    trace, operations, changes,
    get pendingTimers() { return timers.size; },
    reconcile(overrides = {}) {
      emit("capture-enter");
      const result = reconcileExpandedPageSelection({ event, editor, root, disabled, ...overrides });
      emit("capture-exit", { result });
      return result;
    },
    nativeInput() {
      emit("native-enter", { selection: clone(editor.selection), defaultPrevented: event.defaultPrevented });
      handler(event);
      emit("native-exit");
    },
    queueSelectionChange() { schedule(); },
    close() { schedule.cancel(); onSelection.cancel(); timers.clear(); },
  };
}

module.exports = { nativePageBeforeInput, fullRange, paragraph };
