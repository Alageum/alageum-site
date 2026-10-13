/**
 * Diagnostic-only, disposable Page-fixture instrumentation. Install BEFORE
 * React loads with page.addInitScript(installNativePageProbe); after setup and
 * BEFORE input, call window.__alageumNativePageProbe.attach({ slug }). Its
 * stop() returns a cloned, bounded report. Never attach to a real document.
 *
 * This observes the native pipeline, but reads, a callback wrapper, a minimal
 * DevTools hook and microtasks can affect scheduling. Controlled fixture tests
 * establish probe behavior only; they do not prove native browser behavior or
 * establish a fix. No timers, selection changes, form writes or clock overrides.
 * Keep every dependency inside this function: Playwright serializes it.
 */
export function installNativePageProbe() {
  const globalName = '__alageumNativePageProbe';
  const hookName = '__REACT_DEVTOOLS_GLOBAL_HOOK__';
  const failures = new WeakSet();
  const fail = code => { const caught = new Error(`PAGE_NATIVE_PROBE:${code}`); failures.add(caught); throw caught; };
  if (hookName in window) fail('EXISTING_DEVTOOLS_HOOK');
  if (globalName in window) fail('EXISTING_PROBE');

  const finders = [];
  let injectionError = null;
  let active = null;
  const hook = {
    supportsFiber: true,
    inject(renderer) {
      // Do not retain the renderer, bind to it, or inspect its other fields.
      const finder = renderer?.findFiberByHostInstance;
      if (typeof finder !== 'function') injectionError = 'INCOMPATIBLE_RENDERER';
      else if (finders.length >= 4) injectionError = 'RENDERER_LIMIT';
      else finders.push(finder);
      return finders.length;
    },
    onCommitFiberUnmount(_rendererId, fiber) {
      // Inspect this single host identity only; never traverse an unmount tree.
      if (active && fiber?.stateNode === active.host) active.close('EDITOR_UNMOUNTED');
    },
  };
  window[hookName] = hook;

  function attach({ slug, maxRecords = 400 } = {}) {
    if (!/^page-sync-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(slug ?? '')) fail('INVALID_FIXTURE_SLUG');
    if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 500) fail('INVALID_RECORD_LIMIT');
    if (active) fail('ALREADY_ATTACHED');
    if (window[hookName] !== hook) fail('DEVTOOLS_HOOK_CHANGED');
    if (injectionError) fail(injectionError);
    if (!finders.length) fail('MISSING_RENDERER');

    const limits = { records: maxRecords, ancestors: 160, pathDepth: 32, bodyNodes: 96, bodyText: 8192, operations: 64 };
    const report = {
      schemaVersion: 1,
      diagnosticOnly: true,
      schedulingCaveat: 'Instrumentation and queued microtasks may affect scheduling; this is not uninstrumented browser proof.',
      limits, events: [], errors: [], truncated: false, droppedRecords: 0,
      stopped: false, stoppedReason: null,
    };
    let host = null;
    let slugInput = null;
    let editor = null;
    let getValues = null;
    let original = null;
    let wrapper = null;
    let observer = null;
    let route = null;
    let stopped = false;
    let callbackId = 0;
    const cloneReport = () => JSON.parse(JSON.stringify(report));
    const error = code => { if (!report.errors.includes(code) && report.errors.length < 24) report.errors.push(code); };
    const own = (value, key) => {
      const descriptor = value && Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && !Object.hasOwn(descriptor, 'value')) throw new Error('ACCESSOR');
      return descriptor?.value;
    };
    const currentRoute = () => {
      const url = new URL(window.location.href);
      if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
        || url.username || url.password) return null;
      const pathname = decodeURIComponent(url.pathname);
      return /^\/cms\/content-manager\/collection-types\/api::page\.page\/(?:create|[a-z0-9]{1,64})$/.test(pathname) ? pathname : null;
    };
    function close(reason = 'MANUAL_STOP') {
      if (stopped) return;
      stopped = true;
      report.stopped = true;
      report.stoppedReason = reason;
      document.removeEventListener('beforeinput', beforeInput, true);
      document.removeEventListener('selectionchange', selectionChange, true);
      window.removeEventListener('pagehide', pageHide, true);
      window.removeEventListener('popstate', navigation, true);
      window.removeEventListener('hashchange', navigation, true);
      observer?.disconnect();
      try {
        if (editor && editor.onChange === wrapper) editor.onChange = original;
      } catch { error('CALLBACK_RESTORE_FAILED'); }
      if (active?.close === close) active = null;
      host = slugInput = editor = getValues = original = wrapper = observer = null;
    }
    function abort(code) { error(code); close(code); return null; }
    function scopedValues() {
      if (stopped) return null;
      try {
        if (window[hookName] !== hook) return abort('DEVTOOLS_HOOK_CHANGED');
        if (currentRoute() !== route) return abort('ROUTE_CHANGED');
        if (!host.isConnected) return abort('EDITOR_UNMOUNTED');
        const hosts = document.querySelectorAll('[data-slate-editor]');
        if (hosts.length !== 1 || hosts[0] !== host) return abort('EDITOR_HOST_CHANGED');
        const slugs = document.querySelectorAll('input[name="slug"]');
        if (slugs.length !== 1 || slugs[0] !== slugInput || slugInput.value !== slug) return abort('DOM_SLUG_CHANGED');
        const values = Reflect.apply(getValues, undefined, []);
        if (!values || own(values, 'slug') !== slug) return abort('FORM_SLUG_CHANGED');
        return values;
      } catch { return abort('SCOPE_READ_FAILED'); }
    }
    function body(value) {
      // A fresh native create Form may not contain body yet. Keep it distinct
      // from a deliberate clear (null), an empty Blocks array and a read error.
      if (value === undefined) return { status: 'unset', value: null };
      if (value === null) return { status: 'null', value: null };
      let nodes = 0;
      let text = 0;
      let truncated = false;
      function visit(node, depth) {
        if (++nodes > limits.bodyNodes || depth > 4) { truncated = true; return null; }
        const type = own(node, 'type');
        if (type === 'text') {
          const content = own(node, 'text');
          if (typeof content !== 'string') throw new Error('BODY');
          const remaining = Math.max(0, limits.bodyText - text);
          text += content.length;
          if (content.length > remaining) truncated = true;
          return { type: 'text', text: content.slice(0, remaining) };
        }
        if (type !== 'paragraph' || !Array.isArray(own(node, 'children'))) throw new Error('BODY');
        return { type, children: list(own(node, 'children'), depth + 1) };
      }
      function list(items, depth) {
        const result = [];
        for (let index = 0; index < items.length; index++) {
          if (nodes >= limits.bodyNodes) { truncated = true; break; }
          result.push(visit(items[index], depth));
        }
        return result;
      }
      try {
        if (!Array.isArray(value)) throw new Error('BODY');
        const result = list(value, 0);
        if (truncated) { report.truncated = true; error('BODY_TRUNCATED'); }
        return { status: truncated ? 'truncated' : 'value', value: result };
      } catch { error('BODY_SCHEMA_UNSUPPORTED'); return { status: 'unavailable', value: null }; }
    }
    function slateSelection() {
      const selected = own(editor, 'selection');
      if (selected === null) return { isNull: true, anchor: null, focus: null };
      function point(value) {
        const path = own(value, 'path');
        const offset = own(value, 'offset');
        if (!Array.isArray(path) || !path.length || path.length > limits.pathDepth
          || !Number.isSafeInteger(offset) || offset < 0) throw new Error('SELECTION');
        let node = editor;
        for (const index of path) {
          const children = own(node, 'children');
          if (!Number.isSafeInteger(index) || index < 0 || !Array.isArray(children) || index >= children.length) throw new Error('SELECTION');
          node = children[index];
        }
        if (typeof own(node, 'text') !== 'string' || offset > own(node, 'text').length) throw new Error('SELECTION');
        return { path: path.slice(), offset };
      }
      try {
        const anchor = point(own(selected, 'anchor'));
        const focus = point(own(selected, 'focus'));
        return { isNull: false, anchor, focus, collapsed: anchor.offset === focus.offset && anchor.path.join(',') === focus.path.join(',') };
      } catch { error('SLATE_SELECTION_INVALID'); return { isNull: false, invalid: true, anchor: null, focus: null }; }
    }
    function domSelection() {
      function endpoint(node, offset) {
        if (!node || (node !== host && !host.contains(node))) return { insideEditor: false };
        if (!Number.isSafeInteger(offset) || offset < 0 || ![1, 3].includes(node.nodeType)
          || offset > (node.nodeType === 3 ? node.length : node.childNodes.length)) throw new Error('DOM_SELECTION');
        const nodeType = node.nodeType;
        const path = [];
        while (node !== host) {
          if (path.length >= limits.pathDepth || !node.parentNode) throw new Error('DOM_SELECTION');
          const index = Array.prototype.indexOf.call(node.parentNode.childNodes, node);
          if (index < 0) throw new Error('DOM_SELECTION');
          path.unshift(index);
          node = node.parentNode;
        }
        return { insideEditor: true, path, nodeType, offset };
      }
      try {
        const selection = document.getSelection();
        if (!selection) return null;
        const result = { rangeCount: selection.rangeCount, collapsed: Boolean(selection.isCollapsed),
          anchor: endpoint(selection.anchorNode, selection.anchorOffset), focus: endpoint(selection.focusNode, selection.focusOffset), range: null };
        if (selection.rangeCount) {
          const range = selection.getRangeAt(0);
          result.range = { start: endpoint(range.startContainer, range.startOffset), end: endpoint(range.endContainer, range.endOffset), collapsed: Boolean(range.collapsed) };
        }
        return result;
      } catch { error('DOM_SELECTION_INVALID'); return { invalid: true }; }
    }
    function operations() {
      const known = ['insert_node', 'remove_node', 'merge_node', 'split_node', 'move_node', 'set_node', 'insert_text', 'remove_text', 'set_selection'];
      const values = own(editor, 'operations');
      if (!Array.isArray(values)) { error('OPERATIONS_INVALID'); return []; }
      if (values.length > limits.operations) { report.truncated = true; error('OPERATIONS_TRUNCATED'); }
      return values.slice(0, limits.operations).map(operation => {
        const type = own(operation, 'type');
        if (known.includes(type)) return type;
        error('OPERATION_TYPE_UNKNOWN');
        return 'unknown';
      });
    }
    function record(type, phase, metadata = {}) {
      const values = scopedValues();
      if (!values) return;
      if (report.events.length >= maxRecords) {
        report.truncated = true;
        report.droppedRecords = Math.min(Number.MAX_SAFE_INTEGER, report.droppedRecords + 1);
        return;
      }
      try {
        report.events.push({ type, phase, atMs: performance.timeOrigin + performance.now(), ...metadata,
          dom: domSelection(), editor: { selection: slateSelection(), operationTypes: operations(), body: body(own(editor, 'children')) },
          form: { body: body(own(values, 'body')) } });
      } catch { error('SNAPSHOT_READ_FAILED'); }
    }
    function beforeInput(event) {
      if (stopped || (event.target !== host && !host.contains(event.target))) return;
      // Metadata is allowlisted; never read event.data, dataTransfer or DOM text.
      const types = ['insertText', 'insertReplacementText', 'insertLineBreak', 'insertParagraph', 'insertFromPaste', 'insertFromDrop',
        'insertCompositionText', 'insertFromComposition', 'deleteCompositionText', 'deleteByComposition', 'deleteByCut', 'deleteByDrag',
        'deleteContent', 'deleteContentBackward', 'deleteContentForward', 'deleteWordBackward', 'deleteWordForward',
        'deleteSoftLineBackward', 'deleteSoftLineForward', 'deleteHardLineBackward', 'deleteHardLineForward', 'deleteEntireSoftLine', 'historyUndo', 'historyRedo'];
      const metadata = { inputType: types.includes(event.inputType) ? event.inputType : 'unknown', isComposing: Boolean(event.isComposing), defaultPrevented: Boolean(event.defaultPrevented) };
      record('beforeinput', 'capture', metadata);
      if (stopped) return;
      // Capture runs before native handling. The first microtask can precede
      // Slate's queued onChange; the nested one can reveal that commitment.
      queueMicrotask(() => {
        if (stopped) return;
        const after = { ...metadata, defaultPrevented: Boolean(event.defaultPrevented) };
        record('beforeinput', 'microtask-1', after);
        if (!stopped) queueMicrotask(() => { if (!stopped) record('beforeinput', 'microtask-2', after); });
      });
    }
    function selectionChange() { record('selectionchange', 'capture'); }
    function pageHide() { close('PAGE_HIDDEN'); }
    function navigation() { if (!stopped) scopedValues(); }

    try {
      route = currentRoute();
      if (!route) fail('INVALID_PAGE_ROUTE');
      const hosts = document.querySelectorAll('[data-slate-editor]');
      if (hosts.length !== 1 || hosts[0].getAttribute('data-slate-editor') !== 'true') fail('EDITOR_HOST_COUNT');
      host = hosts[0];
      const slugs = document.querySelectorAll('input[name="slug"]');
      if (slugs.length !== 1 || slugs[0].value !== slug) fail('DOM_SLUG_MISMATCH');
      slugInput = slugs[0];
      let fiber = null;
      for (const finder of finders) {
        const candidate = Reflect.apply(finder, undefined, [host]);
        if (candidate) { if (fiber) fail('AMBIGUOUS_RENDERER'); fiber = candidate; }
      }
      if (!fiber || fiber.stateNode !== host) fail('MISSING_HOST_FIBER');
      let foundForm = false;
      const visited = new Set();
      // Only this host's return chain. No child/sibling/alternate traversal,
      // hooks, auth contexts, state nodes or arbitrary prop serialization.
      for (let depth = 0; fiber; depth++, fiber = fiber.return) {
        if (depth >= limits.ancestors || visited.has(fiber)) fail('ANCESTOR_LIMIT');
        visited.add(fiber);
        const props = fiber.memoizedProps;
        if (fiber.type?.displayName === 'FormProvider') {
          if (!editor || typeof own(props, 'getValues') !== 'function') fail('INCOMPATIBLE_FORM');
          getValues = own(props, 'getValues');
          foundForm = true;
          break;
        }
        const candidate = own(props, 'editor');
        if (candidate !== undefined) {
          if (editor || !Array.isArray(own(props, 'initialValue')) || typeof own(props, 'onChange') !== 'function'
            || !Array.isArray(own(candidate, 'children')) || !Array.isArray(own(candidate, 'operations'))
            || typeof own(candidate, 'apply') !== 'function' || typeof own(candidate, 'onChange') !== 'function') fail('INCOMPATIBLE_SLATE');
          editor = candidate;
        }
      }
      if (!foundForm) fail('MISSING_FORM');
      visited.clear();
      fiber = null;
      if (!scopedValues()) fail(report.stoppedReason);
      original = editor.onChange;
      function wrap(native) {
        return function (...args) {
          // Scope loss/unmount may clear attachment refs even during the call.
          // A caller that retained this wrapper still reaches its native target.
          if (stopped) return Reflect.apply(native, this, args);
          const id = ++callbackId;
          record('onChange', 'before', { callbackId: id });
          try {
            const result = Reflect.apply(native, this, args);
            record('onChange', 'after', { callbackId: id });
            return result;
          } catch (caught) {
            error('NATIVE_ONCHANGE_THROW');
            record('onChange', 'throw', { callbackId: id });
            throw caught;
          }
        };
      }
      wrapper = wrap(original);
      const descriptor = Object.getOwnPropertyDescriptor(editor, 'onChange');
      if (!descriptor || !Object.hasOwn(descriptor, 'value') || !descriptor.writable) fail('CALLBACK_NOT_WRITABLE');
      editor.onChange = wrapper;
      active = { host, close };
      document.addEventListener('beforeinput', beforeInput, { capture: true, passive: true });
      document.addEventListener('selectionchange', selectionChange, { capture: true, passive: true });
      window.addEventListener('pagehide', pageHide, { capture: true, passive: true });
      window.addEventListener('popstate', navigation, { capture: true, passive: true });
      window.addEventListener('hashchange', navigation, { capture: true, passive: true });
      observer = new MutationObserver(() => { if (!stopped) scopedValues(); });
      observer.observe(document.documentElement, { childList: true, subtree: true });
      record('attach', 'setup');
      return Object.freeze({ stop() { close(); return cloneReport(); }, snapshot: cloneReport });
    } catch (caught) {
      close('ATTACH_FAILED');
      // Propagate only our fixed codes. Renderer/getValues errors may contain
      // private data, so never put their messages or stacks in the report.
      if (failures.has(caught)) throw caught;
      fail('ATTACH_READ_FAILED');
    }
  }
  window[globalName] = Object.freeze({ attach });
}
