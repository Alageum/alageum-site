"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire, wrap } = require("node:module");
const React = require("react");
const { renderToString } = require("react-dom/server");

// Exercise the installed, unchanged BlocksEditor callback, not a transcription
// of its debounce implementation. Real React server rendering creates its hooks
// and real Slate supplies editor/empty-state behavior. Visual child modules and
// the Slate host are substitutes: this is not a DOM, effect, or keyboard test.
function nativeBlocksCallback(props) {
  const manifestFile = require.resolve("@strapi/content-manager/package.json");
  assert.equal(JSON.parse(fs.readFileSync(manifestFile, "utf8")).version, "5.56.0");
  const filename = path.join(path.dirname(manifestFile),
    "dist/admin/pages/EditView/components/FormInputs/BlocksInput/BlocksEditor.js");
  const nativeRequire = createRequire(filename);
  const slateReact = nativeRequire("slate-react");
  const timers = new Map();
  const changes = [];
  let now = 0;
  let nextTimerId = 1;
  let captured;
  const Empty = () => null;
  const jsxRuntime = require("react/jsx-runtime");
  const substitutes = {
    "react": React,
    "react/jsx-runtime": jsxRuntime,
    "@strapi/admin/strapi-admin": {
      createContext: () => [Empty, () => ({})],
      useIsMobile: () => false,
      useStrapiApp: (_name, select) => select({ plugins: {} }),
    },
    "@strapi/design-system": { Divider: Empty, VisuallyHidden: Empty, IconButton: Empty },
    "@strapi/icons": { Expand: Empty },
    "react-intl": { useIntl: () => ({ formatMessage: message => message.defaultMessage }) },
    "styled-components": { styled: () => () => Empty },
    "./BlocksContent.js": { BlocksContent: Empty },
    "./BlocksToolbar.js": { BlocksToolbar: Empty },
    "./EditorLayout.js": { EditorLayout: Empty },
    "./Modifiers.js": { modifiers: {} },
    "slate-react": {
      ...slateReact,
      Slate: nativeProps => {
        // Match Slate's initialValue assignment on mount. No React effects or
        // contenteditable event routing are simulated by this host.
        nativeProps.editor.children = nativeProps.initialValue;
        captured = nativeProps;
        return null;
      },
    },
  };
  const module = { exports: {} };
  const context = vm.createContext({
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id),
  });
  const execute = new vm.Script(wrap(fs.readFileSync(filename, "utf8")), { filename }).runInContext(context);
  execute(module.exports, name => Object.hasOwn(substitutes, name) ? substitutes[name] : nativeRequire(name),
    module, filename, path.dirname(filename));
  renderToString(React.createElement(module.exports.BlocksEditor, {
    name: "body",
    value: [],
    ...props,
    onChange(name, value) {
      changes.push({ name, value: structuredClone(value), at: now });
    },
  }));
  assert.ok(captured, "the installed BlocksEditor rendered its Slate host");

  return {
    changes,
    get pendingTimers() { return timers.size; },
    change(value, operation = { type: "insert_text", path: [0, 0], offset: 0, text: "x" }) {
      captured.editor.children = value;
      captured.editor.operations = [operation];
      captured.onChange(value);
      captured.editor.operations = [];
    },
    replaceEditorChildren(value) {
      // Slate reinitialization assigns children without invoking onChange.
      // This exposes what an already scheduled callback retains; it does not
      // claim to reproduce the full Content Manager discard flow.
      captured.editor.children = value;
    },
    advance(milliseconds) {
      const end = now + milliseconds;
      for (;;) {
        const next = [...timers.entries()].filter(([, timer]) => timer.at <= end)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, timer] = next;
        timers.delete(id);
        now = timer.at;
        timer.callback();
      }
      now = end;
    },
  };
}

module.exports = { nativeBlocksCallback };
