import React from "react";
import { flushSync } from "react-dom";
import { useField } from "@strapi/admin/strapi-admin";
import { unstable_useContentManagerContext as useContentManagerContext } from "@strapi/content-manager/strapi-admin";
import { BlocksInput as NativeBlocksInput } from "../../../node_modules/@strapi/content-manager/dist/admin/pages/EditView/components/FormInputs/BlocksInput/BlocksInput.mjs";
import { isPageBodyField, pageEditorInputProps } from "../page-editor-options.mjs";
import { PageSelectionBoundary } from "./PageSelectionBridge";

const PageBodyInput = React.forwardRef(function PageBodyInput(props, ref) {
  const field = useField(props.name);
  const onChange = props.onChange ?? field.onChange;
  const commitChange = React.useCallback((...args) => {
    // Native livePreviewSync removes its debounce, but Form.onChange still
    // dispatches a batched React update. A keyboard Publish can read getValues
    // before that render. Commit this field update before returning to Slate.
    flushSync(() => onChange(...args));
  }, [onChange]);
  return <PageSelectionBoundary disabled={props.disabled} readOnly={props.readOnly}>
    <NativeBlocksInput {...props} onChange={commitChange} ref={ref} />
  </PageSelectionBoundary>;
});

// BlocksInput is not a public export. check-page-editor-adapter.js verifies the
// exact official package bytes before build/start; upgrades require review.
// Reuse native rendering, form integration, permissions and empty normalization.
// Synchronous mode creates no delayed callback that can outlive a discard/reset.
const PageBlocksInput = React.forwardRef(function PageBlocksInput(props, ref) {
  const { model } = useContentManagerContext();
  const Input = isPageBodyField(model, props.name) ? PageBodyInput : NativeBlocksInput;
  return <Input {...pageEditorInputProps(model, props)} ref={ref} />;
});

export default PageBlocksInput;
