import { createElement } from "react";

const Icon = () => createElement("svg", { viewBox: "0 0 24 24", width: 20, height: 20, fill: "none", stroke: "currentColor", strokeWidth: 1.7, "aria-hidden": true },
  createElement("path", { d: "M3 4h18v16H3zM3 10h18M9 4v16" }));

export default {
  register(app) {
    app.addMenuLink({
      to: "plugins/alageum-catalog",
      icon: Icon,
      intlLabel: { id: "alageum-catalog.name", defaultMessage: "ALAGEUM catalog" },
      Component: () => import("./pages/Catalog"),
      permissions: [{ action: "plugin::alageum-catalog.manage", subject: null }],
    });
    app.registerPlugin({ id: "alageum-catalog", name: "ALAGEUM catalog" });
  },
};
