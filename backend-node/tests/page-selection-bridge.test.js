"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { transformSync } = require("esbuild");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { createPortal, flushSync } = require("react-dom");
const { createEditor } = require("slate");
const { Slate, withReact } = require("slate-react");

const backendRoot = path.resolve(__dirname, "..");
const nativeRoot = path.join(path.dirname(require.resolve("@strapi/content-manager/package.json")), "dist/admin");
const paragraph = [{ type: "paragraph", children: [{ type: "text", text: "Body" }] }];

function load(filename, substitutes = {}, transform = false) {
  const nativeRequire = createRequire(filename);
  const source = fs.readFileSync(filename, "utf8");
  const compiled = transform ? transformSync(source, { loader: filename.endsWith(".jsx") ? "jsx" : "js", format: "cjs" }).code : source;
  const module = { exports: {} };
  vm.compileFunction(compiled, ["module", "exports", "require"], { filename })(module, module.exports,
    id => Object.hasOwn(substitutes, id) ? substitutes[id] : nativeRequire(id));
  return module.exports;
}

function loadBridge(reconcile = () => {}) {
  return load(path.join(backendRoot, "src/admin/components/PageSelectionBridge.jsx"), {
    "../page-selection-sync.mjs": { reconcileExpandedPageSelection: reconcile },
  }, true);
}

function nativeParagraph(onRender = () => {}) {
  const Typography = React.forwardRef(function Typography({ tag, variant, ...props }, ref) {
    onRender({ tag, variant, ...props, ref });
    return React.createElement(tag, { ...props, ref });
  });
  return load(path.join(nativeRoot, "pages/EditView/components/FormInputs/BlocksInput/Blocks/Paragraph.js"), {
    "@strapi/design-system": { Typography },
    "@strapi/icons": { Paragraph: () => null },
    "../utils/conversions.js": { baseHandleConvert() {} },
  }).paragraphBlocks;
}

// A minimal host for React's real DOM commits, callback refs and portals. This
// fixture does not simulate selection, browser beforeinput, or native deletion.
// The reconciliation unit suite and browser probe cover those separately.
function hostFixture(t) {
  const previous = Object.fromEntries(["window", "document"].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const warnings = [];
  const originalError = console.error;
  console.error = (...args) => warnings.push(args);
  const document = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
  const window = { document, event: undefined, HTMLIFrameElement: class {} };
  function element(tag) {
    const attributes = new Map();
    const node = {
      nodeType: 1, tagName: tag.toUpperCase(), nodeName: tag.toUpperCase(), localName: tag,
      namespaceURI: "http://www.w3.org/1999/xhtml", ownerDocument: document,
      parentNode: null, childNodes: [], style: {}, textContent: "", listeners: [], calls: [],
      appendChild(child) {
        child.parentNode?.removeChild(child);
        this.childNodes.push(child); child.parentNode = this; return child;
      },
      insertBefore(child, before) {
        child.parentNode?.removeChild(child);
        this.childNodes.splice(this.childNodes.indexOf(before), 0, child); child.parentNode = this; return child;
      },
      removeChild(child) {
        this.childNodes.splice(this.childNodes.indexOf(child), 1); child.parentNode = null; return child;
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      closest(selector) {
        assert.equal(selector, '[data-slate-editor="true"]');
        for (let current = this; current; current = current.parentNode) {
          if (current.getAttribute("data-slate-editor") === "true") return current;
        }
        return null;
      },
      addEventListener(type, listener, capture) {
        this.calls.push({ action: "add", type, listener, capture });
        if (!this.listeners.some(entry => entry.type === type && entry.listener === listener && entry.capture === capture)) {
          this.listeners.push({ type, listener, capture });
        }
      },
      removeEventListener(type, listener, capture) {
        this.calls.push({ action: "remove", type, listener, capture });
        this.listeners = this.listeners.filter(entry => entry.type !== type || entry.listener !== listener || entry.capture !== capture);
      },
      dispatch(event) { for (const entry of [...this.listeners]) if (entry.type === event.type) entry.listener(event); },
    };
    Object.defineProperty(node, "firstChild", { get: () => node.childNodes[0] ?? null });
    return node;
  }
  document.createElement = element;
  document.createElementNS = (_namespace, tag) => element(tag);
  document.createTextNode = text => ({ nodeType: 3, nodeValue: text, ownerDocument: document, parentNode: null });
  document.body = element("body");
  Object.assign(globalThis, { window, document });
  const container = element("main");
  const portal = element("aside");
  const root = createRoot(container);
  let closed = false;
  const close = () => { if (!closed) { closed = true; flushSync(() => root.unmount()); } };
  t.after(() => {
    try { close(); }
    finally {
      console.error = originalError;
      for (const name of ["window", "document"]) {
        if (previous[name]) Object.defineProperty(globalThis, name, previous[name]);
        else delete globalThis[name];
      }
    }
    assert.deepEqual(warnings, [], "no React ref, lifecycle, or rendering warnings");
  });
  return { container, portal, element, close, render: value => flushSync(() => root.render(value)) };
}

function editorView({ editor, blocks, refs, ids = ["one"], portal, editableRef, extraAttributes = {}, children = "Body" }) {
  const editable = React.createElement("div", { "data-slate-editor": "true", contentEditable: true,
    suppressContentEditableWarning: true, ref: editableRef }, ids.map(id => React.createElement(React.Fragment, { key: id },
    blocks.paragraph.renderElement({ element: paragraph[0], children,
      attributes: { "data-slate-node": "element", "data-block-id": id, ...extraAttributes, ref: refs[id] } }))));
  return React.createElement(Slate, { editor, initialValue: paragraph }, portal ? createPortal(editable, portal) : editable);
}

test("bootstrap uses the actual native public registry and preserves every descriptor property", () => {
  const bridge = loadBridge();
  const blocks = nativeParagraph();
  const metadata = Symbol("custom native metadata");
  blocks.paragraph[metadata] = { retained: true };
  const { ContentManagerPlugin } = load(path.join(nativeRoot, "content-manager.js"), {
    "./components/InjectionZone.js": { INJECTION_ZONES: {} },
    "./constants/plugin.js": { PLUGIN_ID: "content-manager" },
    "./pages/EditView/components/DocumentActions.js": { DEFAULT_ACTIONS: [] },
    "./pages/EditView/components/FormInputs/BlocksInput/DefaultBlocksStore.js": { defaultBlocksStore: blocks },
    "./pages/EditView/components/Header.js": { DEFAULT_HEADER_ACTIONS: [] },
    "./pages/EditView/components/Panels.js": { ActionsPanel: () => null },
    "./pages/ListView/components/BulkActions/Actions.js": { DEFAULT_BULK_ACTIONS: [] },
    "./pages/ListView/components/TableActions.js": { DEFAULT_TABLE_ROW_ACTIONS: [] },
  });
  const input = () => null;
  const appModule = load(path.join(backendRoot, "src/admin/app.js"), {
    "./components/PageBlocksInput": { default: input }, "./components/PageSelectionBridge": bridge,
  }, true).default;
  const plugin = new ContentManagerPlugin();
  const fields = [];
  const app = { addFields: field => fields.push(field), getPlugin: name => {
    assert.equal(name, "content-manager"); return plugin.config;
  } };
  appModule.register(app);
  assert.equal(fields.length, 1);
  assert.equal(fields[0].type, "blocks");
  assert.equal(plugin.config.apis.getRichTextBlocks().paragraph, blocks.paragraph, "register does not race native plugin registration");
  appModule.bootstrap(app);
  const wrapped = plugin.config.apis.getRichTextBlocks().paragraph;
  assert.notEqual(wrapped.renderElement, blocks.paragraph.renderElement);
  for (const key of Reflect.ownKeys(blocks.paragraph)) {
    if (key !== "renderElement") assert.equal(wrapped[key], blocks.paragraph[key], `${String(key)} remains native`);
  }
  appModule.bootstrap(app);
  assert.equal(plugin.config.apis.getRichTextBlocks().paragraph, wrapped, "repeated bootstrap does not nest wrappers");
  assert.throws(() => appModule.bootstrap({ getPlugin: () => undefined }), /addRichTextBlocks API/);
  for (const invalid of [null, [], {}, { paragraph: null }, { paragraph: { renderElement() {} } },
    { ...blocks, unsupported: {} }]) assert.throws(() => bridge.wrapPageSelectionBlocks(invalid), /incompatible/);
});

test("outside the Page boundary the native renderer receives the identical props and ref", t => {
  const host = hostFixture(t);
  const bridge = loadBridge(() => assert.fail("unscoped native blocks must not reconcile"));
  let received;
  const ref = React.createRef();
  const props = Object.freeze({ element: paragraph[0], children: "Native", attributes: Object.freeze({ ref }) });
  const descriptor = { matchNode: () => true, renderElement(value) {
    assert.equal(this, descriptor); received = value; return React.createElement("p", { ...value.attributes }, value.children);
  } };
  const blocks = bridge.wrapPageSelectionBlocks({ paragraph: descriptor });
  host.render(blocks.paragraph.renderElement(props));
  assert.equal(received, props);
  assert.equal(ref.current.tagName, "P");
  assert.equal(host.container.childNodes.length, 1, "no extra DOM wrapper");
  assert.deepEqual(ref.current.calls, []);
});

test("real React refs count sibling blocks and preserve native formatting, arguments, and callback identity", t => {
  const host = hostFixture(t);
  const reconciliations = [];
  const bridge = loadBridge(args => reconciliations.push(args));
  const renders = new Map();
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph(props => renders.set(props["data-block-id"], props)));
  const editor = withReact(createEditor());
  const calls = [];
  const returned = {};
  const refs = { one: (...args) => { calls.push(["one", ...args]); return returned; }, two: React.createRef() };
  let editable;
  const editableRef = node => { if (node) editable = node; };
  const render = (ids = ["one", "two"]) => host.render(React.createElement(bridge.PageSelectionBoundary, null,
    editorView({ editor, blocks, refs, ids, editableRef, extraAttributes: { dir: "rtl", className: "native-block" },
      children: React.createElement("strong", null, "Bold") })));
  render();
  assert.equal(editable.childNodes.length, 2);
  assert.equal(editable.childNodes[0].tagName, "P");
  assert.equal(editable.childNodes[0].firstChild.tagName, "STRONG");
  assert.equal(editable.childNodes[0].getAttribute("dir"), "rtl");
  assert.equal(editable.childNodes[0].getAttribute("class"), "native-block");
  assert.equal(renders.get("one").variant, "omega");
  assert.equal(refs.two.current, editable.childNodes[1]);
  assert.equal(editable.calls.length, 1, "siblings share exactly one capture listener");
  assert.equal(editable.calls[0].capture, true);
  const composedRef = renders.get("one").ref;
  const firstNode = editable.childNodes[0];
  const extra = {};
  assert.equal(composedRef(firstNode, extra), returned);
  assert.deepEqual(calls.at(-1), ["one", firstNode, extra]);
  assert.equal(editable.calls.length, 1, "repeated attachment of the same block does not add ownership");
  render();
  assert.equal(renders.get("one").ref, composedRef, "ordinary render keeps the native ref's composed identity");
  const event = Object.freeze({ type: "beforeinput", target: editable });
  editable.dispatch(event);
  assert.deepEqual(reconciliations, [{ event, editor, root: editable, disabled: false }]);
  render(["two"]);
  assert.deepEqual(calls.at(-1), ["one", null]);
  assert.equal(editable.calls.length, 1, "one sibling's removal cannot remove another's listener");
  render([]);
  assert.equal(refs.two.current, null);
  assert.equal(editable.listeners.length, 0);
  assert.equal(editable.calls[1].listener, editable.calls[0].listener);
  assert.equal(editable.calls[1].capture, true);
});

test("ref changes preserve other registrations and disabled/readOnly use committed boundary props", t => {
  const host = hostFixture(t);
  const reconciliations = [];
  const bridge = loadBridge(args => reconciliations.push(args));
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph());
  const editor = withReact(createEditor());
  const first = React.createRef();
  const second = React.createRef();
  const refs = { one: first, two: React.createRef() };
  let editable;
  const editableRef = node => { if (node) editable = node; };
  const render = props => host.render(React.createElement(bridge.PageSelectionBoundary, props,
    editorView({ editor, blocks, refs, ids: ["one", "two"], editableRef })));
  render({ disabled: true });
  editable.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations.at(-1).disabled, true);
  refs.one = second;
  render({ disabled: false, readOnly: true });
  assert.equal(first.current, null);
  assert.equal(second.current, editable.childNodes[0]);
  assert.equal(editable.calls.length, 1, "replacing one native ref retains the shared listener");
  editable.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations.at(-1).disabled, true);
  render({ disabled: false, readOnly: false });
  editable.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations.at(-1).disabled, false);
  assert.equal(editable.calls.length, 1, "permission updates do not recreate capture listeners");
});

test("fullscreen portals move ownership to their actual editable root and leave no stale listener", t => {
  const host = hostFixture(t);
  const reconciliations = [];
  const bridge = loadBridge(args => reconciliations.push(args));
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph());
  const editor = withReact(createEditor());
  const refs = { one: React.createRef() };
  let editable;
  const editableRef = node => { if (node) editable = node; };
  const render = portal => host.render(React.createElement(bridge.PageSelectionBoundary, null,
    editorView({ editor, blocks, refs, editableRef, portal })));
  render();
  const normal = editable;
  render(host.portal);
  const fullscreen = editable;
  assert.notEqual(fullscreen, normal);
  assert.equal(fullscreen.parentNode, host.portal);
  assert.equal(normal.listeners.length, 0);
  assert.equal(fullscreen.listeners.length, 1);
  normal.dispatch({ type: "beforeinput" });
  fullscreen.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations.length, 1);
  assert.equal(reconciliations[0].root, fullscreen);
  assert.equal(reconciliations[0].editor, editor);
  render();
  assert.equal(fullscreen.listeners.length, 0);
  assert.equal(editable.listeners.length, 1);
  host.close();
  assert.equal(editable.listeners.length, 0);
  assert.equal(refs.one.current, null);
});

test("StrictMode effect replay reinstalls one listener and actual unmount removes it exactly", t => {
  const host = hostFixture(t);
  const reconciliations = [];
  const bridge = loadBridge(args => reconciliations.push(args));
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph());
  const editor = withReact(createEditor());
  const refs = { one: React.createRef() };
  let editable;
  const editableRef = node => { if (node) editable = node; };
  host.render(React.createElement(React.StrictMode, null, React.createElement(bridge.PageSelectionBoundary, null,
    editorView({ editor, blocks, refs, editableRef }))));
  assert.deepEqual(editable.calls.map(call => call.action), ["add", "remove", "add"]);
  assert.equal(editable.listeners.length, 1);
  editable.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations.length, 1);
  host.close();
  assert.deepEqual(editable.calls.map(call => call.action), ["add", "remove", "add", "remove"]);
  assert.ok(editable.calls.every(call => call.listener === editable.calls[0].listener && call.capture === true));
  assert.equal(editable.listeners.length, 0);
  editable.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations.length, 1);
});

test("multiple Page editors keep independent roots, permission state, and cleanup", t => {
  const host = hostFixture(t);
  const reconciliations = [];
  const bridge = loadBridge(args => reconciliations.push(args));
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph());
  const editors = [withReact(createEditor()), withReact(createEditor())];
  const refs = [{ one: React.createRef() }, { one: React.createRef() }];
  const editables = [];
  const editableRefs = editors.map((_editor, index) => node => { if (node) editables[index] = node; });
  const render = count => host.render(React.createElement(React.Fragment, null, editors.slice(0, count).map((editor, index) =>
    React.createElement(bridge.PageSelectionBoundary, { key: index, disabled: index === 1 },
      editorView({ editor, blocks, refs: refs[index], editableRef: editableRefs[index] })))));
  render(2);
  for (const editable of editables) editable.dispatch({ type: "beforeinput" });
  assert.equal(reconciliations[0].editor, editors[0]);
  assert.equal(reconciliations[1].editor, editors[1]);
  assert.equal(reconciliations[0].disabled, false);
  assert.equal(reconciliations[1].disabled, true);
  assert.notEqual(editables[0].listeners[0].listener, editables[1].listeners[0].listener);
  render(1);
  assert.equal(editables[0].listeners.length, 1);
  assert.equal(editables[1].listeners.length, 0);
  assert.equal(refs[1].one.current, null);
  host.close();
  assert.equal(editables[0].listeners.length, 0);
});

test("unsupported attached hosts produce a compatibility error and release the previous root", t => {
  const host = hostFixture(t);
  const bridge = loadBridge();
  let composedRef;
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph(props => { composedRef = props.ref; }));
  const editor = withReact(createEditor());
  const refs = { one: React.createRef() };
  let editable;
  host.render(React.createElement(bridge.PageSelectionBoundary, null,
    editorView({ editor, blocks, refs, editableRef: node => { if (node) editable = node; } })));
  assert.equal(editable.listeners.length, 1);
  assert.throws(() => composedRef(host.element("p")), /no supported Slate editable host/);
  assert.equal(editable.listeners.length, 0, "an invalid replacement cannot keep the previous editor active");
  composedRef(null);
  assert.equal(refs.one.current, null);
});

test("a throwing native detach retains the original error and arguments while removing our listener", t => {
  const host = hostFixture(t);
  const bridge = loadBridge();
  let composedRef;
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph(props => { composedRef = props.ref; }));
  const editor = withReact(createEditor());
  const error = new Error("native detach failure");
  const returned = {};
  const nativeCalls = [];
  let throwNext = false;
  const refs = { one: (...args) => {
    nativeCalls.push(args);
    if (throwNext) { throwNext = false; throw error; }
    return returned;
  } };
  let editable;
  host.render(React.createElement(bridge.PageSelectionBoundary, null,
    editorView({ editor, blocks, refs, editableRef: node => { if (node) editable = node; } })));
  assert.equal(composedRef(editable.firstChild), returned);
  throwNext = true;
  const extraArgument = {};
  assert.throws(() => composedRef(null, extraArgument), thrown => thrown === error);
  assert.deepEqual(nativeCalls.at(-1), [null, extraArgument]);
  assert.equal(editable.listeners.length, 0);
  assert.equal(editable.calls[1].listener, editable.calls[0].listener);
  assert.equal(editable.calls[1].capture, true);
  assert.equal(composedRef(null), returned);
  assert.equal(editable.calls.length, 2, "later cleanup does not release a sibling or remove twice");
});

test("actual Page input adds the bridge only for Page/body and cleans it up on model or field changes", t => {
  const host = hostFixture(t);
  const reconciliations = [];
  const bridge = loadBridge(args => reconciliations.push(args));
  const blocks = bridge.wrapPageSelectionBlocks(nativeParagraph());
  const editor = withReact(createEditor());
  const refs = { one: React.createRef() };
  const fieldChange = () => {};
  let model = "api::page.page";
  let editable;
  const editableRef = node => { if (node) editable = node; };
  const NativeInput = React.forwardRef(function NativeInput(_props, ref) {
    React.useImperativeHandle(ref, () => ({ native: true }), []);
    return editorView({ editor, blocks, refs, editableRef });
  });
  const options = load(path.join(backendRoot, "src/admin/page-editor-options.mjs"), {}, true);
  const Input = load(path.join(backendRoot, "src/admin/components/PageBlocksInput.jsx"), {
    "@strapi/admin/strapi-admin": { useField: () => ({ onChange: fieldChange }) },
    "@strapi/content-manager/strapi-admin": { unstable_useContentManagerContext: () => ({ model }) },
    "../../../node_modules/@strapi/content-manager/dist/admin/pages/EditView/components/FormInputs/BlocksInput/BlocksInput.mjs": { BlocksInput: NativeInput },
    "../page-editor-options.mjs": options, "./PageSelectionBridge": bridge,
  }, true).default;
  const inputRef = React.createRef();
  const render = (name = "body") => host.render(React.createElement(Input, { name, ref: inputRef }));
  render();
  const pageRoot = editable;
  assert.equal(pageRoot.listeners.length, 1);
  assert.equal(inputRef.current.native, true);
  model = "api::article.article";
  render();
  assert.equal(pageRoot.listeners.length, 0);
  assert.equal(editable.listeners.length, 0);
  model = "api::page.page";
  render("summary");
  assert.equal(editable.listeners.length, 0);
  render();
  assert.equal(editable.listeners.length, 1);
  host.close();
  assert.equal(editable.listeners.length, 0);
  assert.equal(inputRef.current, null);
  assert.deepEqual(reconciliations, []);
});
