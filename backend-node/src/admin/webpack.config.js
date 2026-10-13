"use strict";
const path = require("node:path");

// Strapi 5.56's content-type-builder imports micromatch into the browser.
// Its path/util/process requirements also fail on the unmodified PR7 baseline.
// This documented webpack-only hook supplies real browser implementations;
// it does not change the default Vite configuration or suppress missing modules.
module.exports = (config, webpack) => {
  // Strapi passes an import() namespace; callers may also supply CJS directly.
  const compiler = webpack.default || webpack;
  const generatorManifestPath = require.resolve("generator-function/package.json");
  const generator = require(generatorManifestPath);
  const exports = generator.exports?.["."];
  if (generator.version !== "2.0.1" || !Array.isArray(exports)
    || exports[0]?.["module-sync"] !== "./require.mjs"
    || exports[0]?.import !== "./index.mjs"
    || exports[0]?.default !== "./index.js" || exports[1] !== "./index.js") {
    throw new Error("Review the generator-function browser entry before changing its pinned version/export map");
  }
  // Select the package's declared CJS default, not its Node module-sync wrapper.
  // This exact request alias leaves every other package's conditions unchanged.
  const generatorBrowserEntry = path.resolve(path.dirname(generatorManifestPath), exports[0].default);
  return {
    ...config,
    resolve: {
      ...config.resolve,
      alias: { ...config.resolve?.alias, "generator-function$": generatorBrowserEntry },
      fallback: {
        ...config.resolve?.fallback,
        path: require.resolve("path-browserify"),
        util: require.resolve("util/"),
      },
    },
    plugins: [
      ...(config.plugins || []),
      new compiler.ProvidePlugin({ process: require.resolve("process/browser") }),
    ],
  };
};
