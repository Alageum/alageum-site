import React from "react";
import { useSlateStatic } from "slate-react";
import { reconcileExpandedPageSelection } from "../page-selection-sync.mjs";

const PageSelectionContext = React.createContext(null);
const wrappedBlocks = new WeakMap();
const incompatible = detail => new Error(`Page selection bridge is incompatible with the native Blocks editor: ${detail}`);

function createRegistration() {
  const roots = new Map();
  let active = false;
  let disabled = true;
  return {
    setDisabled(value) { disabled = value; },
    resume() {
      active = true;
      for (const [root, entry] of roots) root.addEventListener("beforeinput", entry.listener, true);
    },
    suspend() {
      active = false;
      for (const [root, entry] of roots) root.removeEventListener("beforeinput", entry.listener, true);
    },
    acquire(element, editor) {
      const root = element?.nodeType === 1 && element.closest?.('[data-slate-editor="true"]');
      if (!root || root.nodeType !== 1 || typeof root.addEventListener !== "function"
        || typeof root.removeEventListener !== "function") {
        throw incompatible("a rendered block has no supported Slate editable host");
      }
      let entry = roots.get(root);
      if (entry && entry.editor !== editor) throw incompatible("one editable host belongs to multiple editors");
      if (!entry) {
        entry = { editor, count: 0, listener: event => reconcileExpandedPageSelection({ event, editor, root, disabled }) };
        roots.set(root, entry);
        if (active) root.addEventListener("beforeinput", entry.listener, true);
      }
      entry.count += 1;
      let released = false;
      return () => {
        if (released) return;
        released = true;
        entry.count -= 1;
        if (entry.count === 0) {
          if (active) root.removeEventListener("beforeinput", entry.listener, true);
          roots.delete(root);
        }
      };
    },
  };
}

// Context follows the native fullscreen portal without adding a layout element.
export function PageSelectionBoundary({ children, disabled = false, readOnly = false }) {
  const [registration] = React.useState(createRegistration);
  React.useLayoutEffect(() => { registration.setDisabled(Boolean(disabled || readOnly)); }, [registration, disabled, readOnly]);
  React.useLayoutEffect(() => {
    registration.resume();
    // Keep registrations while effects replay in StrictMode. Actual ref detach
    // releases them; suspended listeners cannot run after a real unmount.
    return () => registration.suspend();
  }, [registration]);
  return <PageSelectionContext.Provider value={registration}>{children}</PageSelectionContext.Provider>;
}

function RegisteredBlock({ descriptor, blockProps, registration }) {
  const editor = useSlateStatic();
  const nativeRef = blockProps.attributes?.ref;
  if (typeof nativeRef !== "function" && (!nativeRef || typeof nativeRef !== "object" || !("current" in nativeRef))) {
    throw incompatible("a rendered block has no supported native attributes.ref");
  }
  const attached = React.useRef(null);
  const ref = React.useCallback((element, ...args) => {
    let result;
    try {
      if (typeof nativeRef === "function") result = nativeRef(element, ...args);
      else nativeRef.current = element;
    } finally {
      // A native detach error must still release our ownership. Let that exact
      // error reach React; do not leave a listener alive on its abandoned host.
      if (!element) {
        attached.current?.release();
        attached.current = null;
      }
    }
    if (element && attached.current?.element !== element) {
      attached.current?.release();
      attached.current = null;
      attached.current = { element, release: registration.acquire(element, editor) };
    }
    return result;
  }, [nativeRef, registration, editor]);
  return descriptor.renderElement({ ...blockProps, attributes: { ...blockProps.attributes, ref } });
}

function PageAwareBlock({ descriptor, blockProps }) {
  const registration = React.useContext(PageSelectionContext);
  if (!registration) return descriptor.renderElement(blockProps);
  return <RegisteredBlock descriptor={descriptor} blockProps={blockProps} registration={registration} />;
}

// Used only through Strapi's public content-manager bootstrap extension API.
// All keyboard handlers, matchers, toolbar metadata and native renderers remain
// the registered descriptors' own values; only attributes.ref is composed.
export function wrapPageSelectionBlocks(blocks) {
  if (!blocks || typeof blocks !== "object" || Array.isArray(blocks) || !blocks.paragraph) {
    throw incompatible("the registered block store is missing its paragraph descriptor");
  }
  return Object.fromEntries(Object.entries(blocks).map(([name, descriptor]) => {
    if (!descriptor || typeof descriptor !== "object" || Array.isArray(descriptor)
      || typeof descriptor.renderElement !== "function" || typeof descriptor.matchNode !== "function") {
      throw incompatible(`the registered ${name} block has unsupported metadata`);
    }
    let wrapped = wrappedBlocks.get(descriptor);
    if (!wrapped) {
      wrapped = { ...descriptor, renderElement: blockProps => <PageAwareBlock descriptor={descriptor} blockProps={blockProps} /> };
      wrappedBlocks.set(descriptor, wrapped);
      wrappedBlocks.set(wrapped, wrapped);
    }
    return [name, wrapped];
  }));
}
