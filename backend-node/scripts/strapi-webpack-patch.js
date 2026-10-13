"use strict";
// Application-owned compatibility patch, not an upstream Strapi release.
const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { createHash, randomUUID } = require("node:crypto");
const manifest = require("../patches/strapi-webpack-koa.json");

const originalBridge = `        ctx.strapi.server.app.use((context, next)=>{
            // wait for webpack-dev-middleware to signal that the build is ready
            const ready = new Promise((resolve)=>{
                devMiddleware.waitUntilValid(()=>{
                    resolve(true);
                });
            });
            // tell webpack-dev-middleware to handle the request
            const init = new Promise((resolve)=>{
                devMiddleware(context.req, {
                    // @ts-expect-error ignored
                    end (content) {
                        // eslint-disable-next-line no-param-reassign
                        context.body = content;
                        resolve(true);
                    },
                    getHeader: context.get.bind(context),
                    // @ts-expect-error ignored
                    setHeader: context.set.bind(context),
                    locals: context.state
                }, ()=>resolve(next()));
            });
            return Promise.all([
                ready,
                init
            ]);
        });`;
const patchedBridge = `        // ALAGEUM compatibility patch: use middleware's supported Koa bridge.
        ctx.strapi.server.app.use(async (context, next)=>{
            await new Promise((resolve)=>devMiddleware.waitUntilValid(resolve));
            await koaDevMiddleware(context, next);
        });`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
// The upstream HEAD path opens a stream but returns before registering cleanup.
// The documented hook runs before that return. Preserve all response metadata
// and all non-HEAD data; only release the unused HEAD body stream.
function closeHeadStream(req, _res, data, byteLength) {
  if (req.method === "HEAD" && data && typeof data.pipe === "function" && typeof data.destroy === "function") {
    data.destroy();
  }
  return { data, byteLength };
}
function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error("Strapi webpack patch anchor mismatch");
  return source.replace(before, after);
}
function transform(source, format, reverse = false) {
  const factory = format === "cjs" ? "webpackDevMiddleware__default.default" : "webpackDevMiddleware";
  const original = `        const devMiddleware = ${factory}(compiler);`;
  const patched = `        const koaDevMiddleware = ${factory}.koaWrapper(compiler, {\n            modifyResponseData: ${closeHeadStream.toString()}\n        });\n        const devMiddleware = koaDevMiddleware.devMiddleware;`;
  return reverse
    ? replaceOnce(replaceOnce(source, patched, original), patchedBridge, originalBridge)
    : replaceOnce(replaceOnce(source, original, patched), originalBridge, patchedBridge);
}
function inspect(appDir) {
  const physicalApp = fs.realpathSync(appDir);
  const modulesPath = path.join(physicalApp, "node_modules");
  if (!fs.lstatSync(modulesPath).isDirectory())
    throw new Error("Refusing a symlinked or non-directory node_modules root");
  const fromApp = createRequire(path.join(physicalApp, "package.json"));
  const packagePath = fromApp.resolve("@strapi/strapi/package.json");
  const root = fs.realpathSync(path.dirname(packagePath));
  const installedRoot = modulesPath + path.sep;
  if (!root.startsWith(installedRoot)) throw new Error("Refusing to patch a Strapi installation outside this application's node_modules");
  const fromStrapi = createRequire(packagePath);
  for (const [name, filename, expected] of [
    ["@strapi/strapi", packagePath, manifest.strapiVersion],
    ["webpack-dev-middleware", fromStrapi.resolve("webpack-dev-middleware/package.json"), manifest.middlewareVersion],
  ]) {
    const actual = JSON.parse(fs.readFileSync(filename, "utf8")).version;
    if (actual !== expected) throw new Error(`Strapi webpack patch version drift: ${name} ${actual}; expected ${expected}`);
  }
  return manifest.files.map((file) => {
    const filename = path.join(root, file.path);
    const realPath = fs.realpathSync(filename);
    if (!fs.lstatSync(filename).isFile() || !realPath.startsWith(root + path.sep))
      throw new Error("Refusing a non-file or redirected Strapi patch target");
    const before = fs.readFileSync(filename, "utf8");
    const hash = sha256(before);
    if (hash === file.patchedSha256) return { filename, realPath, before, after: before, state: "patched" };
    if (hash !== file.originalSha256) throw new Error(`Strapi webpack patch source drift: ${file.path}`);
    const after = transform(before, file.format);
    if (sha256(after) !== file.patchedSha256) throw new Error(`Strapi webpack patch result mismatch: ${file.path}`);
    return { filename, realPath, before, after, state: "original" };
  });
}
function stillOwned(file, expected) {
  try {
    return fs.lstatSync(file.filename).isFile()
      && fs.realpathSync(file.filename) === file.realPath
      && fs.readFileSync(file.filename, "utf8") === expected;
  } catch { return false; }
}
function applyPatch({ appDir = path.resolve(__dirname, ".."), checkOnly = false } = {}) {
  // Validate both formats and all versions before writing either file.
  const planned = inspect(appDir);
  const changes = planned.filter((file) => file.state === "original");
  if (checkOnly && changes.length)
    throw new Error("Strapi webpack adapter is unpatched; run npm run postinstall after a normal npm ci");
  const staged = [], committed = [];
  try {
    for (const file of changes) {
      const temporary = `${file.filename}.alageum-${randomUUID()}`;
      staged.push({ ...file, temporary });
      fs.writeFileSync(temporary, file.after, { flag: "wx", mode: fs.statSync(file.filename).mode });
    }
    for (const file of staged) {
      // Refuse a concurrent package mutation rather than overwriting it.
      if (!stillOwned(file, file.before)) throw new Error("Strapi changed while patching");
      fs.renameSync(file.temporary, file.filename);
      committed.push(file);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const file of committed.reverse()) {
      let temporary;
      try {
        if (!stillOwned(file, file.after)) throw new Error("Concurrent Strapi content preserved during rollback");
        temporary = `${file.filename}.alageum-rollback-${randomUUID()}`;
        fs.writeFileSync(temporary, file.before, { flag: "wx", mode: fs.statSync(file.filename).mode });
        if (!stillOwned(file, file.after)) throw new Error("Concurrent Strapi content preserved during rollback");
        fs.renameSync(temporary, file.filename);
      } catch (rollbackError) { rollbackErrors.push(rollbackError); }
      finally { if (temporary) fs.rmSync(temporary, { force: true }); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], `${error.message}; rollback left changed targets untouched and requires verification`);
    throw error;
  } finally {
    for (const file of staged) fs.rmSync(file.temporary, { force: true });
  }
  return { checked: planned.length, changed: changes.length, strapi: manifest.strapiVersion, middleware: manifest.middlewareVersion };
}
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 || !["--apply", "--check"].includes(args[0])) throw new Error("Use --apply or --check");
    console.log("Strapi webpack adapter: " + JSON.stringify(applyPatch({ checkOnly: args[0] === "--check" })));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { applyPatch, transform, sha256, closeHeadStream, manifest };
