import { Range, Transforms } from "slate";
import { ReactEditor } from "slate-react";

function isValidTextPoint(editor, point) {
  let node = editor;
  for (const index of point.path) {
    if (!Number.isInteger(index) || index < 0) return false;
    node = node.children?.[index];
    if (!node) return false;
  }
  return typeof node.text === "string" && Number.isInteger(point.offset)
    && point.offset >= 0 && point.offset <= node.text.length;
}

// Called by the Page body bridge during capture, before Slate's unchanged
// native beforeinput listener. Only reconcile selection: Slate owns the edit,
// history, normalization, cancellation, and form callback.
export function reconcileExpandedPageSelection({ event, editor, root, disabled = false } = {}) {
  const skipped = reason => ({ status: "skipped", reason });
  if (!event || event.type !== "beforeinput"
    || !["deleteContentForward", "deleteContentBackward"].includes(event.inputType)) {
    return skipped("unsupported-event");
  }
  // Synthetic events must not select another range. Non-cancelable mobile/IME
  // events belong to Slate's native input-manager path.
  if (event.isTrusted !== true || event.cancelable !== true || event.defaultPrevented) {
    return skipped("inactive-event");
  }
  if (!editor || !root || disabled) return skipped("disabled-or-missing");
  if (event.isComposing) return skipped("composing");

  let range;
  try {
    if (ReactEditor.isReadOnly(editor)) return skipped("read-only");
    if (ReactEditor.isComposing(editor)) return skipped("composing");
    const ownsRoot = () => root.nodeType === 1 && root.isConnected === true
      && root.getAttribute("data-slate-editor") === "true"
      && root.getAttribute("contenteditable") === "true"
      && root.isContentEditable === true
      && ReactEditor.toDOMNode(editor, editor) === root;
    if (!ownsRoot() || event.target !== root) return skipped("root-mismatch");
    const documentRoot = ReactEditor.findDocumentOrShadowRoot(editor);
    if (documentRoot.activeElement !== root) return skipped("inactive-root");
    const selection = documentRoot.getSelection();
    // Selection.isCollapsed can be wrong in Chromium shadow roots. Match the
    // native converter's endpoint check, then verify the concrete Range too.
    if (!selection || selection.rangeCount !== 1
      || (selection.anchorNode === selection.focusNode
        && selection.anchorOffset === selection.focusOffset)) {
      return skipped("no-expanded-dom-range");
    }
    const domRange = selection.getRangeAt(0);
    const withinRoot = node => !!node && root.contains(node)
      && ReactEditor.hasDOMNode(editor, node, { editable: true });
    if (domRange.collapsed || !withinRoot(selection.anchorNode)
      || !withinRoot(selection.focusNode) || !withinRoot(domRange.startContainer)
      || !withinRoot(domRange.endContainer) || !root.contains(domRange.commonAncestorContainer)) {
      return skipped("outside-root");
    }
    // Match Slate's public selection conversion, including element boundaries
    // and zero-width leaves. Invalid mappings must leave the native path alone.
    range = ReactEditor.toSlateRange(editor, selection, { exactMatch: false, suppressThrow: true });
    if (!Range.isRange(range) || !Range.isExpanded(range) || !ReactEditor.hasRange(editor, range)
      || !isValidTextPoint(editor, range.anchor) || !isValidTextPoint(editor, range.focus)) {
      return skipped("invalid-slate-range");
    }
    // Root/editor mappings are mutable during remounts; never reuse ownership
    // from a previous event or select an editor whose host has changed.
    if (!ownsRoot() || documentRoot.activeElement !== root) return skipped("root-mismatch");
  } catch {
    return skipped("unavailable-dom-mapping");
  }

  if (editor.selection && Range.equals(editor.selection, range)) return { status: "unchanged" };
  Transforms.select(editor, range);
  return { status: "reconciled" };
}
