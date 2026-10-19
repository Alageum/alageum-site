// Only this application's Page body opts into the pinned native editor's
// synchronous form updates. Preserve every native prop and other field mode.
export function isPageBodyField(model, name) {
  return ["api::page.page", "api::news-article.news-article"].includes(model) && name === "body";
}

export function pageEditorInputProps(model, props) {
  return isPageBodyField(model, props.name)
    ? { ...props, livePreviewSync: true }
    : props;
}
