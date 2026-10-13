"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");
const { transformSync } = require("esbuild");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { flushSync } = require("react-dom");
const slateReact = require("slate-react");
const { useComposedRefs } = require("@radix-ui/react-compose-refs");
// Strapi's public design-system export uses this exact installed hook. Load its
// ESM entry explicitly because the package's Node CJS entry has different exports.
const { useCallbackRef } = require(path.join(path.dirname(require.resolve("@strapi/ui-primitives")), "index.mjs"));

const backendRoot = path.resolve(__dirname, "../..");
const adminRoot = path.dirname(require.resolve("@strapi/admin/package.json"));
const contentManagerRoot = path.dirname(require.resolve("@strapi/content-manager/package.json"));
const blocksRoot = path.join(contentManagerRoot, "dist/admin/pages/EditView/components/FormInputs/BlocksInput");

function loadModule(filename, substitutes, { transform = false, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const nativeRequire = createRequire(filename);
  let source = fs.readFileSync(filename, "utf8");
  if (transform) source = transformSync(source, { loader: filename.endsWith("jsx") ? "jsx" : "js", format: "cjs" }).code;
  const module = { exports: {} };
  const execute = vm.compileFunction(source,
    ["exports", "require", "module", "__filename", "__dirname", "setTimeout", "clearTimeout"], { filename });
  execute(module.exports, id => Object.hasOwn(substitutes, id) ? substitutes[id] : nativeRequire(id),
    module, filename, path.dirname(filename), setTimer, clearTimer);
  return module.exports;
}

// A focused commit-scheduling fixture, not a browser or keyboard simulation.
// ReactDOM createRoot/flushSync, the installed Form/context/reducer/useField,
// BlocksInput/BlocksEditor, Slate normalization/plugins, and application adapter
// are real. Visual/routing dependencies and Slate's rendered host are replaced.
// The host exposes the native AST callback so tests control its delivery, while
// React's scheduler, state, effects, and commit phases remain unchanged.
function nativePageForm({ mode = "application", model = "api::page.page", name = "body", initialValues,
  inputProps = {}, initialErrors } = {}) {
  assert.equal(JSON.parse(fs.readFileSync(path.join(contentManagerRoot, "package.json"), "utf8")).version, "5.56.0");
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  const originalError = console.error;
  const originalWarn = console.warn;
  const warnings = [];
  console.error = (...args) => warnings.push({ level: "error", args });
  console.warn = (...args) => warnings.push({ level: "warn", args });

  // No host elements are emitted. This root only satisfies ReactDOM's container
  // and event-registration contract; it implements no layout or browser events.
  const document = { nodeType: 9, activeElement: null, addEventListener() {}, removeEventListener() {} };
  const window = { document, event: undefined, HTMLIFrameElement: class {} };
  Object.defineProperty(globalThis, "window", { configurable: true, writable: true, value: window });
  Object.defineProperty(globalThis, "document", { configurable: true, writable: true, value: document });
  const container = { nodeType: 1, tagName: "DIV", nodeName: "DIV", textContent: "",
    namespaceURI: "http://www.w3.org/1999/xhtml", ownerDocument: document,
    addEventListener() {}, removeEventListener() {} };

  let root;
  let closed = false;
  const timers = new Set();
  let timerRequests = 0;
  const restore = () => {
    console.error = originalError;
    console.warn = originalWarn;
    if (previousWindow) Object.defineProperty(globalThis, "window", previousWindow);
    else delete globalThis.window;
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else delete globalThis.document;
  };

  try {
    const Empty = () => null;
    const PassThrough = React.forwardRef(function PassThrough({ children }, ref) {
      React.useImperativeHandle(ref, () => ({ querySelectorAll: () => [] }), []);
      return children;
    });
    const intl = { useIntl: () => ({ formatMessage: message => message.defaultMessage ?? message.id }) };
    const formModule = loadModule(path.join(adminRoot, "dist/admin/admin/src/components/Form.js"), {
      "@strapi/design-system": { Box: PassThrough, useCallbackRef, useComposedRefs, Dialog: {}, Button: Empty },
      "@strapi/icons": { WarningCircle: Empty },
      "react-intl": intl,
      "react-router-dom": { useBlocker: () => ({ state: "unblocked" }) },
      "../hooks/useRegisterUnsavedChanges.js": { useRegisterUnsavedChanges() {} },
      "../hooks/useWarnIfUnsavedChanges.js": { useWarnIfUnsavedChanges() {} },
    });
    const { Form, useForm, useField } = formModule;
    const { createContext } = require(path.join(adminRoot, "dist/admin/admin/src/components/Context.js"));
    let slateProps;
    let editorProps;
    let fieldProps;
    let form;
    let mounts = 0;
    const inputRef = React.createRef();
    function SlateHost(props) {
      React.useState(() => {
        // The actual Slate host makes this same assignment on initial mount.
        props.editor.children = props.initialValue;
        return null;
      });
      React.useEffect(() => { mounts += 1; }, []);
      slateProps = props;
      return null;
    }
    const nativeEditor = loadModule(path.join(blocksRoot, "BlocksEditor.js"), {
      "@strapi/admin/strapi-admin": { createContext, useIsMobile: () => false,
        useStrapiApp: (_consumer, select) => select({ plugins: {} }) },
      "@strapi/design-system": { Divider: Empty, VisuallyHidden: Empty, IconButton: Empty },
      "@strapi/icons": { Expand: Empty },
      "react-intl": intl,
      "styled-components": { styled: () => () => Empty },
      "./BlocksContent.js": { BlocksContent: Empty },
      "./BlocksToolbar.js": { BlocksToolbar: Empty },
      "./EditorLayout.js": { EditorLayout: Empty },
      "./Modifiers.js": { modifiers: {} },
      "slate-react": { ...slateReact, Slate: SlateHost },
    }, {
      setTimer(callback, delay) {
        timerRequests += 1;
        const id = setTimeout(() => { timers.delete(id); callback(); }, delay);
        timers.add(id);
        return id;
      },
      clearTimer(id) { timers.delete(id); clearTimeout(id); },
    });
    const CaptureEditor = React.forwardRef(function CaptureEditor(props, ref) {
      editorProps = props;
      return React.createElement(nativeEditor.BlocksEditor, { ...props, ref });
    });
    function FieldRoot(props) { fieldProps = props; return props.children; }
    const nativeInput = loadModule(path.join(blocksRoot, "BlocksInput.js"), {
      "@strapi/admin/strapi-admin": { useField },
      "@strapi/design-system": { Field: { Root: FieldRoot, Label: Empty, Hint: Empty, Error: Empty }, Flex: PassThrough },
      "./BlocksEditor.js": { BlocksEditor: CaptureEditor },
    });
    const options = loadModule(path.join(backendRoot, "src/admin/page-editor-options.mjs"), {}, { transform: true });
    const bridge = loadModule(path.join(backendRoot, "src/admin/components/PageSelectionBridge.jsx"), {}, { transform: true });
    const application = loadModule(path.join(backendRoot, "src/admin/components/PageBlocksInput.jsx"), {
      "@strapi/admin/strapi-admin": { useField },
      "@strapi/content-manager/strapi-admin": { unstable_useContentManagerContext: () => ({ model }) },
      "../../../node_modules/@strapi/content-manager/dist/admin/pages/EditView/components/FormInputs/BlocksInput/BlocksInput.mjs": nativeInput,
      "../page-editor-options.mjs": options,
      "./PageSelectionBridge": bridge,
    }, { transform: true });
    function Probe() { form = useForm("PageCommitProbe", state => state); return null; }
    const Input = mode === "native" ? nativeInput.BlocksInput : application.default;
    const props = { ...inputProps, name, ref: inputRef };
    if (mode === "native") props.livePreviewSync = true;
    root = createRoot(container);
    flushSync(() => root.render(React.createElement(Form, { initialValues, initialErrors },
      React.createElement(React.Fragment, null, React.createElement(Probe), React.createElement(Input, props)))));
    assert.ok(slateProps, "the actual native BlocksEditor mounted its controlled Slate host");

    return {
      warnings,
      inputRef,
      get form() { return form; },
      get editorProps() { return editorProps; },
      get fieldProps() { return fieldProps; },
      get editorChildren() { return slateProps.editor.children; },
      get mounts() { return mounts; },
      get timerRequests() { return timerRequests; },
      get pendingTimers() { return timers.size; },
      change(value, operation = { type: "insert_text", path: [0, 0], offset: 0, text: "x" }) {
        assert.equal(closed, false, "cannot deliver a controlled editor callback after unmount");
        slateProps.editor.children = value;
        slateProps.editor.operations = [operation];
        try { slateProps.onChange(value); }
        finally { slateProps.editor.operations = []; }
      },
      async publishRead() {
        // PublishAction's window keydown handler has discrete event priority.
        // Its asynchronous continuation then yields exactly one microtask before
        // calling the real Form.validate and getValues methods. No act/waitFor
        // or scheduler drains are allowed between dispatch and these reads.
        window.event = { type: "keydown" };
        try { form.setSubmitting(true); }
        finally { window.event = undefined; }
        await Promise.resolve();
        const validation = await form.validate(true, { status: "published" });
        return structuredClone({ validation, values: form.getValues() });
      },
      async reset(values) {
        // External reset has its own native effect/remount cycle. Complete that
        // cycle explicitly; act is never used around the race-sensitive reads.
        const previousActEnvironment = Object.getOwnPropertyDescriptor(globalThis, "IS_REACT_ACT_ENVIRONMENT");
        Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, writable: true, value: true });
        try { await React.act(async () => { form.resetForm(values); }); }
        finally {
          if (previousActEnvironment) Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", previousActEnvironment);
          else delete globalThis.IS_REACT_ACT_ENVIRONMENT;
        }
      },
      close() {
        if (closed) return;
        closed = true;
        try { flushSync(() => root.unmount()); }
        finally {
          for (const id of timers) clearTimeout(id);
          timers.clear();
          restore();
        }
      },
    };
  } catch (error) {
    try { if (root) flushSync(() => root.unmount()); }
    finally { for (const id of timers) clearTimeout(id); restore(); }
    throw error;
  }
}

module.exports = { nativePageForm };
