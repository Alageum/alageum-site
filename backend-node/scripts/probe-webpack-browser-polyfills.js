"use strict";

// Bounded, local browser equivalence probe; this does not start Strapi or upload code.
// Run from the repository: node backend-node/scripts/probe-webpack-browser-polyfills.js
// Add --write-report to save docs/webpack-browser-polyfill-results.json.
// --vm-only checks the compiled bundle without launching Chromium; it is not
// browser acceptance and preserves previous browser-failure evidence in reports.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");
const { createRequire } = require("node:module");
const { pathToFileURL } = require("node:url");
const { createHash } = require("node:crypto");
const nodeUtil = require("node:util");
const vm = require("node:vm");
const { setTimeout: delay } = require("node:timers/promises");

const root = path.resolve(__dirname, "..");
const projectRequire = createRequire(path.join(root, "package.json"));
const frontendRequire = createRequire(path.join(root, "../frontend/package.json"));
const hookFile = path.join(root, "src/admin/webpack.config.js");
const uploadFile = path.join(root, "node_modules/@strapi/content-type-builder/dist/admin/components/AIChat/hooks/useCodeUpload.mjs");
const reportFile = path.join(root, "docs/webpack-browser-polyfill-results.json");
assert.ok(process.argv.slice(2).every(arg => ["--write-report", "--vm-only"].includes(arg)), "supported flags: --write-report, --vm-only");
const vmOnly = process.argv.includes("--vm-only");

// Deliberately exercise relative upload names, dot directories, nested exclusions,
// accepted extensions, and Windows-style input on the same POSIX matching rules.
const fixtures = {
  files: [
    "package.json", "README.md", "src/index.js", "src/index.ts", "src/app.tsx",
    "src/view.jsx", "src/config.json", "docs/guide.md", "src/with space.ts",
    "src/данные.json", "src/.hidden.js", ".env", ".gitignore", "src/main.css",
    "src/image.png", "node_modules/pkg/index.js", "nested/node_modules/pkg/index.ts",
    ".git/config", "nested/.git/config", ".next/server/app.js", "nested/.next/app.js",
    "dist/index.js", "nested/dist/index.ts", "build/index.js", "nested/build/index.ts",
    ".cache/index.json", "nested/.cache/index.json", "coverage/report.json",
    "nested/coverage/report.json", "test/index.js", "nested/test/index.ts",
    "__tests__/index.ts", "src/__tests__/index.ts", "src/unit.test.js",
    "src/unit.spec.ts", "unit.test.tsx", "unit.spec.jsx", "src/testimony.js",
    "src/building.ts", "src/distribution.ts", "src/index.js.map",
    "src\\index.ts", "node_modules\\pkg\\index.js", "src\\__tests__\\unit.ts",
    "src\\unit.test.ts", "C:\\project\\src\\index.ts", "/project/src/index.ts",
    "./src/index.ts", "src/../index.ts", "src//index.ts", "", "README.MD",
    "src/INDEX.TS", "src/private/config.json", "src/generated.ts", "src/.private/code.ts",
  ],
  allowedExtensions: [".ts", ".tsx", ".js", ".jsx", ".md", ".json"],
  customIgnore: ["**/private/**", "**/generated.*"],
  ignore: [
    "**/node_modules/**", "**/.git/**", "**/.next/**", "**/dist/**", "**/build/**",
    "**/.cache/**", "**/coverage/**", "**/test/**", "**/__tests__/**",
    "**/*.test.*", "**/*.spec.*",
  ],
  patterns: [
    "**/*.{js,jsx,ts,tsx,md,json}", "**/*.js", "**/*.ts", "**/*.md", "**/*.json",
    "src/**", "**/node_modules/**", "**/.git/**", "**/.next/**", "**/dist/**",
    "**/build/**", "**/.cache/**", "**/coverage/**", "**/test/**", "**/__tests__/**",
    "**/*.test.*", "**/*.spec.*", "**/!(*.test|*.spec).{js,ts}",
  ],
  pathInputs: [
    "", ".", "..", "src/index.ts", "./src/index.ts", "src/../index.ts",
    "src//nested///index.ts", "/project/src/index.ts", "/project/src/../", "/",
    ".git/config", "src/.hidden.js", "src/file.test.ts", "README.md", "archive.tar.gz",
    "src/with space.ts", "src/данные.json", "src\\index.ts", "C:\\project\\src\\index.ts",
  ],
  joins: [["src", "nested", "index.ts"], ["src", "..", "package.json"], ["", ".git", "config"], ["/project", "src/../", "index.ts"], ["src\\nested", "index.ts"]],
  relatives: [["/project/src", "/project/docs/guide.md"], ["/project", "/project/src/index.ts"], ["/project/src", "/project/src"], ["/project/a", "/other/b"]],
};

// The identical collector is embedded in webpack's browser entry and called in
// Node. Only deterministic, browser-relevant Node/POSIX behavior is compared.
function collectResults(micromatch, posixPath, util, data) {
  const matrices = {};
  for (const [name, options] of Object.entries({ defaults: {}, dot: { dot: true }, windows: { windows: true } })) {
    matrices[name] = data.patterns.map(pattern => ({
      pattern,
      matches: micromatch(data.files, pattern, options),
      isMatch: data.files.map(file => micromatch.isMatch(file, pattern, options)),
    }));
  }
  const invalidInputs = [null, 42, {}, ["index.ts"]].map(value => {
    try { return { result: micromatch.isMatch(value, "**/*.ts") }; }
    catch (error) { return { name: error.name, message: error.message }; }
  });
  const plain = { path: "src/index.ts", ignored: false };
  function Base() {}
  Base.prototype.kind = "base";
  function Child() {}
  util.inherits(Child, Base);
  return {
    micromatch: {
      matrices,
      // Match Strapi's isAllowedFile exactly: default micromatch options and a
      // case-insensitive extension check; custom patterns are appended.
      uploadAllowed: data.files.map(file => ({
        file,
        defaults: !micromatch.isMatch(file, data.ignore) && data.allowedExtensions.some(ext => file.toLowerCase().endsWith(ext)),
        customIgnore: !micromatch.isMatch(file, [...data.ignore, ...data.customIgnore]) && data.allowedExtensions.some(ext => file.toLowerCase().endsWith(ext)),
      })),
      ignored: data.files.map(file => ({ file, ignored: micromatch.isMatch(file, data.ignore, { dot: true }) })),
      included: micromatch(data.files, "**/*.{js,jsx,ts,tsx,md,json}", { dot: true, ignore: data.ignore }),
      invalidInputs,
    },
    path: {
      constants: { sep: posixPath.sep, delimiter: posixPath.delimiter },
      inputs: data.pathInputs.map(input => ({
        input, normalize: posixPath.normalize(input), basename: posixPath.basename(input),
        dirname: posixPath.dirname(input), extname: posixPath.extname(input),
        isAbsolute: posixPath.isAbsolute(input), parse: posixPath.parse(input),
        format: posixPath.format(posixPath.parse(input)), resolve: posixPath.resolve("/project", input),
      })),
      joins: data.joins.map(parts => posixPath.join(...parts)),
      relatives: data.relatives.map(parts => posixPath.relative(...parts)),
    },
    util: {
      format: [util.format("%s:%d:%j:%%", "file", 7, plain), util.format("%s", undefined)],
      inspect: [util.inspect(plain), util.inspect(["index.ts", 1, null]), util.inspect("index.ts")],
      types: {
        regexp: util.types.isRegExp(/\.ts$/), notRegexp: util.types.isRegExp("index.ts"),
        date: util.types.isDate(new Date(0)), notDate: util.types.isDate(0),
        nativeError: util.types.isNativeError(new TypeError("fixture")),
        map: util.types.isMap(new Map()), set: util.types.isSet(new Set()),
        uint8Array: util.types.isUint8Array(new Uint8Array([1, 2])),
      },
      inherits: { instance: new Child() instanceof Base, kind: new Child().kind },
    },
  };
}

async function installedVersion(name, requireFrom = projectRequire) {
  let directory = path.dirname(requireFrom.resolve(name));
  for (;;) {
    try {
      const metadata = JSON.parse(await fs.readFile(path.join(directory, "package.json"), "utf8"));
      if (metadata.name === name) return { version: metadata.version, directory };
    } catch (error) { if (error.code !== "ENOENT") throw error; }
    const parent = path.dirname(directory);
    assert.notEqual(parent, directory, `cannot locate ${name} package metadata`);
    directory = parent;
  }
}

async function compile(compiler) {
  const stats = await new Promise((resolve, reject) => compiler.run((error, result) => error ? reject(error) : resolve(result)));
  const info = stats.toJson({ all: false, errors: true, warnings: true, assets: true });
  assert.equal(stats.hasErrors(), false, JSON.stringify(info.errors, null, 2));
  assert.equal(stats.hasWarnings(), false, JSON.stringify(info.warnings, null, 2));
  const resources = new Set();
  const visit = module => {
    if (module.resource) resources.add(module.resource);
    if (module.modules) for (const child of module.modules) visit(child);
  };
  for (const module of stats.compilation.modules) visit(module);
  return { ...info, resources: [...resources] };
}

async function verifyPortReleased(port) {
  const socket = net.createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
}

function verifyEquivalent(actual, expected) {
  assert.equal(actual.ok, true, JSON.stringify(actual.error));
  for (const group of ["micromatch", "path", "util"]) assert.deepEqual(actual.value.equivalent[group], expected[group], `${group} web-bundle result must match pinned Node/POSIX behavior`);
  assert.deepEqual(actual.value.runtime, { browser: true, cwd: "/", nextTickOrder: ["sync", "nextTick"], promisified: 42 });
}

async function main() {
  const started = Date.now();
  const report = {
    status: "running", startedAt: new Date(started).toISOString(),
    scope: "Standalone webpack browser bundle using Strapi's actual production config and admin hook; no Strapi server or AI upload",
    versions: { node: process.version },
    fixtures: { files: fixtures.files.length, patterns: fixtures.patterns.length, ignore: fixtures.ignore },
    chromium: { status: "not-run", accepted: false },
  };
  let workspace, compiler, server, browser, port;
  const cleanup = async () => {
    const errors = [];
    if (browser) {
      try { await browser.close(); browser = undefined; }
      catch (error) { errors.push(`browser: ${error.message}`); }
    }
    if (server) {
      try {
        server.closeAllConnections();
        await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        server = undefined;
      } catch (error) { errors.push(`server: ${error.message}`); }
    }
    if (compiler) {
      try { await new Promise((resolve, reject) => compiler.close(error => error ? reject(error) : resolve())); compiler = undefined; }
      catch (error) { errors.push(`compiler: ${error.message}`); }
    }
    if (workspace) {
      try { await fs.rm(workspace, { recursive: true, force: true }); await assert.rejects(fs.stat(workspace), { code: "ENOENT" }); }
      catch (error) { errors.push(`fixtures: ${error.message}`); }
    }
    if (port) {
      try { await verifyPortReleased(port); }
      catch (error) { errors.push(`port: ${error.message}`); }
    }
    report.cleanup = {
      fixturesRemoved: Boolean(workspace) && !errors.some(value => value.startsWith("fixtures:")),
      portsOpened: port ? 1 : 0, portReleased: port ? !errors.some(value => value.startsWith("port:")) : null, errors,
    };
    return errors;
  };
  // A stalled compiler/browser is a failure, with best-effort cleanup before the
  // final hard stop. Ordinary operations below also have their own time limits.
  const watchdog = setTimeout(() => {
    console.error("FAIL browser polyfill probe exceeded its 120-second limit");
    const hardStop = setTimeout(() => process.exit(1), 5000);
    hardStop.unref();
    cleanup().finally(() => process.exit(1));
  }, 120000);
  watchdog.unref();
  try {
    if (vmOnly) {
      try {
        const previous = JSON.parse(await fs.readFile(reportFile, "utf8"));
        if (previous.previousBrowserFailure) report.previousBrowserFailure = previous.previousBrowserFailure;
        else if (/browserType\.launch/.test(previous.error?.message || "")) {
          report.previousBrowserFailure = { startedAt: previous.startedAt, webpackHookSha256: previous.webpackHookSha256, error: previous.error, cleanup: previous.cleanup };
        }
        if (previous.previousCompilationFailure) report.previousCompilationFailure = previous.previousCompilationFailure;
        else if (/Module build failed/.test(previous.error?.message || "")) {
          report.previousCompilationFailure = { startedAt: previous.startedAt, webpackHookSha256: previous.webpackHookSha256, strapiConfiguration: previous.strapiConfiguration, error: previous.error, cleanup: previous.cleanup };
        }
      } catch (error) { if (error.code !== "ENOENT") throw error; }
    }
    const webpack = projectRequire("webpack");
    const micromatch = projectRequire("micromatch");
    const { chromium } = frontendRequire("@playwright/test");
    const uploadSource = await fs.readFile(uploadFile, "utf8");
    const uploadRequire = createRequire(uploadFile);
    assert.equal(await fs.realpath(uploadRequire.resolve("micromatch")), await fs.realpath(projectRequire.resolve("micromatch")), "probe and Strapi must use the same installed micromatch");
    for (const [constant, expected] of [["DEFAULT_IGNORE_PATTERNS", fixtures.ignore], ["ALLOWED_EXTENSIONS", fixtures.allowedExtensions]]) {
      const arraySource = uploadSource.match(new RegExp(`const ${constant} = \\[([\\s\\S]*?)\\];`));
      assert.ok(arraySource, `installed useCodeUpload must define ${constant}`);
      const actual = [...arraySource[1].matchAll(/'([^']*)'/g)].map(match => match[1]);
      assert.deepEqual(actual, expected, `probe must mirror installed ${constant}`);
    }
    report.uploadSourceSha256 = createHash("sha256").update(uploadSource).digest("hex");
    for (const name of ["webpack", "micromatch", "path-browserify", "util", "process"]) {
      // Trailing slash selects the installed package instead of Node's builtin.
      const packageRequire = name === "util" || name === "process" ? Object.assign(id => projectRequire(id + "/"), { resolve: id => projectRequire.resolve(id + "/") }) : projectRequire;
      const metadata = await installedVersion(name, packageRequire);
      report.versions[name] = metadata.version;
      if (name === "micromatch") {
        const lock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
        const relative = path.relative(root, metadata.directory).split(path.sep).join("/");
        assert.equal(lock.packages[relative]?.version, metadata.version, "Node comparator must use locked micromatch");
      }
    }
    report.versions.playwright = (await installedVersion("@playwright/test", frontendRequire)).version;
    report.webpackHookSha256 = createHash("sha256").update(await fs.readFile(hookFile)).digest("hex");
    const hook = projectRequire(hookFile);
    assert.equal(typeof hook, "function", "admin hook must export a function");
    workspace = await fs.mkdtemp(path.join(root, ".webpack-browser-polyfill-probe-"));
    const entry = path.join(workspace, "entry.js");
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Local polyfill probe</title></head><body><script src="/bundle.js"></script></body></html>';
    await fs.writeFile(path.join(workspace, "index.html"), html, { flag: "wx" });
    await fs.writeFile(entry, [
      'import micromatch from "micromatch";',
      'import path from "path";',
      'import util from "util";',
      `const collectResults = ${collectResults.toString()};`,
      `const fixtures = ${JSON.stringify(fixtures)};`,
      "async function run() {",
      "  const equivalent = collectResults(micromatch, path, util, fixtures);",
      "  const order = [];",
      "  await new Promise(resolve => { process.nextTick(() => { order.push('nextTick'); resolve(); }); order.push('sync'); });",
      "  const promisified = await util.promisify((value, callback) => callback(null, value + 1))(41);",
      "  return { equivalent, runtime: { browser: process.browser, cwd: process.cwd(), nextTickOrder: order, promisified } };",
      "}",
      "run().then(value => { window.__polyfillProbe = { ok: true, value }; }, error => { window.__polyfillProbe = { ok: false, error: { name: error.name, message: error.message, stack: error.stack } }; });",
      "",
    ].join("\n"), { flag: "wx" });
    const strapi = await installedVersion("@strapi/strapi");
    report.versions.strapi = strapi.version;
    const configPath = path.join(strapi.directory, "dist/src/node/webpack/config.js");
    const contextSource = await fs.readFile(path.join(strapi.directory, "dist/src/node/create-build-context.mjs"), "utf8");
    const defaultTargetSource = contextSource.match(/const DEFAULT_BROWSERSLIST = \[([\s\S]*?)\];/);
    assert.ok(defaultTargetSource, "installed Strapi must define its default browser targets");
    const defaultTargets = [...defaultTargetSource[1].matchAll(/'([^']*)'/g)].map(match => match[1]);
    const target = projectRequire("browserslist").loadConfig({ path: root }) ?? defaultTargets;
    const { resolveProductionConfig } = projectRequire(configPath);
    const production = await resolveProductionConfig({
      cwd: root, entry: path.relative(root, entry), runtimeDir: workspace,
      target, env: { NODE_ENV: "production" }, options: { minify: false, sourcemap: false, stats: false },
      distPath: path.join(workspace, "dist"), basePath: "/",
    });
    // Preserve real Strapi module loaders, targets, aliases, and plugins. Only
    // the small entry/output and single-bundle layout belong to this fixture.
    const base = {
      ...production, target: "web", context: root, entry,
      output: { ...production.output, filename: "bundle.js", clean: true },
      optimization: { ...production.optimization, runtimeChunk: false },
    };
    report.strapiConfiguration = {
      sourceSha256: createHash("sha256").update(await fs.readFile(configPath)).digest("hex"),
      browserQueries: target,
      transpileTargets: production.module.rules.find(rule => rule.use?.options?.target)?.use.options.target,
      productionLoaders: true, productionPlugins: true, minification: false, runtimeChunk: false,
    };
    // Strapi passes import('webpack'), whose default holds the CJS API.
    const webpackNamespace = await import(pathToFileURL(projectRequire.resolve("webpack")).href);
    const config = await hook(base, webpackNamespace);
    assert.ok(config && config.resolve, "actual admin hook must return webpack configuration");
    for (const name of ["path", "util"]) assert.equal(typeof config.resolve.fallback?.[name], "string", `${name} must have a real browser fallback`);
    assert.ok(!Object.values(config.resolve.alias || {}).includes(false), "false aliases are not browser implementations");
    compiler = webpack(config);
    const built = await compile(compiler);
    report.compilation = { errors: 0, warnings: 0, assets: built.assets.map(asset => ({ name: asset.name, size: asset.size })) };
    const generatorPackage = projectRequire.resolve("generator-function/package.json");
    const generatorMetadata = JSON.parse(await fs.readFile(generatorPackage, "utf8"));
    assert.equal(generatorMetadata.version, "2.0.1", "review the generator-function export selection if its pin changes");
    const generatorDefault = generatorMetadata.exports["."][0].default;
    assert.equal(generatorDefault, "./index.js", "the browser alias must select the declared package default");
    const generatorRoot = path.dirname(generatorPackage);
    const generatorResources = built.resources.filter(resource => resource.startsWith(generatorRoot + path.sep));
    assert.ok(generatorResources.includes(path.resolve(generatorRoot, generatorDefault)), "compiled graph must contain generator-function's declared index.js default");
    assert.ok(!generatorResources.includes(path.join(generatorRoot, "require.mjs")), "compiled graph must exclude the Node module-sync wrapper");
    report.compilation.generatorFunction = {
      version: generatorMetadata.version, declaredDefault: generatorDefault,
      compiledModules: generatorResources.map(resource => path.relative(generatorRoot, resource)),
      moduleSyncWrapperAbsent: true,
    };
    const expected = collectResults(micromatch, path.posix, nodeUtil, fixtures);
    report.comparisons = {
      micromatchPatternFilePairs: fixtures.files.length * fixtures.patterns.length * 3,
      micromatchIgnoreFiles: fixtures.files.length, uploadAllowedDecisions: fixtures.files.length * 2,
      micromatchInvalidInputs: expected.micromatch.invalidInputs.length,
      pathInputs: fixtures.pathInputs.length, pathJoins: fixtures.joins.length, pathRelatives: fixtures.relatives.length,
      util: ["format", "inspect", "types", "inherits", "promisify"],
    };
    const bundle = await fs.readFile(path.join(workspace, "dist/bundle.js"));
    // Supplementary isolated-JS check is recorded separately. It never counts
    // as a Chromium pass: the real browser verification below remains required.
    const sandbox = { window: {}, setTimeout, clearTimeout };
    vm.runInNewContext(bundle.toString("utf8"), sandbox, { timeout: 5000, filename: "browser-polyfill-bundle.js" });
    const vmDeadline = Date.now() + 5000;
    while (!sandbox.window.__polyfillProbe && Date.now() < vmDeadline) await delay(10);
    assert.ok(sandbox.window.__polyfillProbe, "isolated bundle must finish");
    verifyEquivalent(JSON.parse(JSON.stringify(sandbox.window.__polyfillProbe)), expected);
    report.isolatedJavaScript = { matchedNode: true, injectedNodeProcess: false, injectedNodeRequire: false };
    if (vmOnly) { report.status = "passed-vm-only"; return; }
    server = http.createServer((request, response) => {
      response.setHeader("Content-Security-Policy", "default-src 'none'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'none'");
      response.setHeader("Cache-Control", "no-store");
      if (request.method !== "GET") { response.writeHead(405).end(); return; }
      if (request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(html);
      } else if (request.url === "/bundle.js") {
        response.writeHead(200, { "Content-Type": "application/javascript" }); response.end(bundle);
      } else if (request.url === "/favicon.ico") response.writeHead(204).end();
      else response.writeHead(404).end();
    });
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
    port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;
    await fs.mkdir(path.join(workspace, "xdg-config"));
    await fs.mkdir(path.join(workspace, "xdg-cache"));
    report.chromium.status = "launching";
    const context = await chromium.launchPersistentContext(path.join(workspace, "chromium-profile"), {
      headless: true, timeout: 30000, serviceWorkers: "block",
      ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
      env: { ...process.env, XDG_CONFIG_HOME: path.join(workspace, "xdg-config"), XDG_CACHE_HOME: path.join(workspace, "xdg-cache") },
    });
    browser = context.browser();
    report.versions.chromium = browser.version();
    const blockedRequests = [];
    await context.route("**/*", async route => {
      if (new URL(route.request().url()).origin === origin) await route.continue();
      else { blockedRequests.push(route.request().url()); await route.abort(); }
    });
    const page = await context.newPage();
    const runtimeErrors = [], consoleErrors = [];
    page.on("pageerror", error => runtimeErrors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    const response = await page.goto(origin, { waitUntil: "load", timeout: 30000 });
    assert.equal(response.status(), 200);
    await page.waitForFunction(() => Boolean(window.__polyfillProbe), undefined, { timeout: 30000 });
    const actual = await page.evaluate(() => window.__polyfillProbe);
    verifyEquivalent(actual, expected);
    assert.deepEqual(runtimeErrors, [], "no uncaught browser exceptions");
    assert.deepEqual(consoleErrors, [], "no browser console errors");
    assert.deepEqual(blockedRequests, [], "bundle must not attempt external requests");
    report.chromium = { status: "passed", accepted: true, matchedNode: true };
    report.runtime = { ...actual.value.runtime, errors: runtimeErrors, consoleErrors, externalRequests: blockedRequests };
    report.status = "passed";
  } catch (error) {
    report.status = "failed";
    report.error = { name: error.name, message: error.message };
    if (report.chromium.status === "launching") report.chromium.status = "failed";
  } finally {
    const cleanupErrors = await cleanup();
    if (cleanupErrors.length) report.status = "failed";
    clearTimeout(watchdog);
    report.durationMs = Date.now() - started;
    if (process.argv.includes("--write-report")) await fs.writeFile(reportFile, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
    if (!["passed", "passed-vm-only"].includes(report.status)) process.exitCode = 1;
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
