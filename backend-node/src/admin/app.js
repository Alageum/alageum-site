import PageBlocksInput from "./components/PageBlocksInput";
import { wrapPageSelectionBlocks } from "./components/PageSelectionBridge";

export default {
  register(app) {
    app.addFields({ type: "blocks", Component: PageBlocksInput });
  },
  bootstrap(app) {
    const apis = app.getPlugin("content-manager")?.apis;
    if (typeof apis?.addRichTextBlocks !== "function") {
      throw new Error("Page selection bridge requires the native content-manager addRichTextBlocks API");
    }
    apis.addRichTextBlocks(wrapPageSelectionBlocks);
  },
};
