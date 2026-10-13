"use strict";
// Test-only HTTP/WebSocket probes against the actual Strapi CLI adapter.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const net = require("node:net");
const { setTimeout: delay } = require("node:timers/promises");
const { randomUUID, createHash } = require("node:crypto");

const mode = process.argv[2];
const root = path.resolve(__dirname, "..");
const base = process.env.VITE_COMPAT_URL;
if (mode !== "build") {
  const address = new URL(base);
  assert.equal(address.protocol, "http:");
  assert.equal(address.hostname, "127.0.0.1", "compatibility probes are loopback-only");
}
const check = (message) => console.log(`PASS ${message}`);
const get = async (url, options = {}) => {
  const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(20000), ...options });
  const body = await response.text();
  return { response, body };
};
async function assets() {
  const files = await fs.readdir(path.join(root, "build"));
  const html = await fs.readFile(path.join(root, "build/index.html"), "utf8");
  const refs = [...html.matchAll(/(?:src|href)="(\/cms\/[^"?]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(refs.some(ref => ref.endsWith(".js")), "CMS entry uses /cms asset paths");
  for (const ref of refs) assert.ok((await fs.stat(path.join(root, "build", ref.slice(5)))).size > 0);
  const js = files.filter(file => file.endsWith(".js"));
  assert.ok(js.length > 10, "real CMS split chunks were emitted");
  assert.ok(js.some(file => /^Catalog-/.test(file)), "catalog lazy editor chunk emitted");
  const fingerprint = createHash("sha256");
  for (const file of [...files].sort()) {
    const stat = await fs.stat(path.join(root, "build", file));
    if (stat.isFile()) fingerprint.update(file).update(await fs.readFile(path.join(root, "build", file)));
  }
  check(`built index, ${js.length} JS chunks, ${files.filter(file => file.endsWith(".css")).length} CSS files; fingerprint ${fingerprint.digest("hex")}`);
  return files.filter(file => /\.(?:js|css)$/.test(file));
}
async function readiness() {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      const { response, body } = await get("/api/v1/readiness");
      if (response.ok && /json/.test(response.headers.get("content-type"))) { JSON.parse(body); return; }
    } catch {}
    await delay(1000);
  }
  throw new Error("Strapi readiness timeout; inspect server log");
}
async function routes() {
  await readiness();
  for (const url of ["/cms/", "/cms/auth/login", "/cms/plugins/alageum-catalog", "/cms/content-manager"]) {
    const { response, body } = await get(url);
    assert.equal(response.status, 200, url);
    assert.match(response.headers.get("content-type"), /text\/html/, url);
    assert.match(body, /<html/i, url);
  }
  const unknown = await get("/api/v1/unknown-vite-probe");
  assert.equal(unknown.response.status, 404);
  assert.match(unknown.response.headers.get("content-type"), /json/);
  assert.doesNotMatch(unknown.body, /<html/i);
  const catalog = await get("/alageum-catalog/products");
  assert.ok([401, 403].includes(catalog.response.status), "CMS data API remains authorization-protected");
  check("CMS shell/deep-route reloads, JSON readiness/API isolation, protected CMS API");
}
async function watch() {
  const generated = path.join(root, ".strapi/client");
  const probePath = path.join(generated, "vite-compat-probe.js");
  const cssPath = path.join(generated, "vite-compat-probe.css");
  const deniedPath = path.join(generated, ".env.vite-compat");
  const outside = process.env.VITE_COMPAT_OUTSIDE_FILE;
  assert.ok(outside && !outside.startsWith(root + path.sep));
  const marker = `vite-compat-${randomUUID()}`;
  const moduleUrl = "/cms/.strapi/client/vite-compat-probe.js";
  const moduleText = suffix => `export const marker = ${JSON.stringify(marker + suffix)};\nif (import.meta.hot) import.meta.hot.accept();\n`;
  const created = [];
  async function create(file, content) {
    await fs.writeFile(file, content, { flag: "wx" });
    created.push(file);
  }
  let socket;
  try {
    await create(probePath, moduleText("before"));
    await create(cssPath, ".vite-compat-probe { color: rgb(1, 2, 3); }");
    await create(deniedPath, marker);
    await create(outside, marker);
    const entry = await get("/cms/.strapi/client/app.js");
    assert.equal(entry.response.status, 200); assert.match(entry.response.headers.get("content-type"), /javascript/);
    assert.match(entry.body, /alageum-catalog/);
    const plugin = await get("/cms/src/plugins/alageum-catalog/admin/src/pages/Catalog.jsx");
    assert.equal(plugin.response.status, 200); assert.match(plugin.response.headers.get("content-type"), /javascript/);
    const imports = new Set([...`${entry.body}\n${plugin.body}`.matchAll(/(?:from\s*|import\s*)["'](\/cms\/node_modules\/[^"']+)["']/g)].map(match => match[1]));
    assert.ok(imports.size > 0, "real CMS dependency imports were transformed");
    for (const url of imports) {
      const dependency = await get(url);
      assert.equal(dependency.response.status, 200, url);
      assert.match(dependency.response.headers.get("content-type"), /javascript/, url);
    }
    check(`${imports.size} actual entry/catalog dependency modules served after optimization`);
    const module = await get(moduleUrl);
    assert.equal(module.response.status, 200); assert.match(module.body, new RegExp(marker + "before"));
    const css = await get("/cms/.strapi/client/vite-compat-probe.css?direct");
    assert.equal(css.response.status, 200); assert.match(css.response.headers.get("content-type"), /text\/css/);
    const cssModule = await get("/cms/.strapi/client/vite-compat-probe.css");
    assert.equal(cssModule.response.status, 200); assert.match(cssModule.body, /updateStyle/);
    const client = await get("/cms/@vite/client");
    assert.equal(client.response.status, 200); assert.match(client.response.headers.get("content-type"), /javascript/);
    const token = client.body.match(/const wsToken = "([^\"]+)"/)?.[1];
    assert.ok(token, "Vite HMR token available in real client");
    socket = new WebSocket(`${base.replace("http:", "ws:")}/cms/?token=${encodeURIComponent(token)}`, "vite-hmr");
    const messages = [];
    socket.addEventListener("message", event => messages.push(JSON.parse(event.data)));
    async function awaitMessage(predicate) {
      const deadline = Date.now() + 30000;
      while (Date.now() < deadline) { const value = messages.find(predicate); if (value) return value; await delay(100); }
      throw new Error(`HMR message timeout (${messages.map(message => message.type).join(", ")})`);
    }
    await awaitMessage(message => message.type === "connected");
    await fs.writeFile(probePath, moduleText("after"));
    const update = await awaitMessage(message => message.type === "update" && message.updates.some(item => item.path.includes("vite-compat-probe.js")));
    assert.ok(update.updates.some(item => item.type === "js-update"));
    const changed = await get(`${moduleUrl}?t=${Date.now()}`);
    assert.match(changed.body, new RegExp(marker + "after"));
    await fs.writeFile(cssPath, ".vite-compat-probe { color: rgb(4, 5, 6); }");
    await awaitMessage(message => message.type === "update" && message.updates.some(item => item.path.includes("vite-compat-probe.css")));
    const changedCss = await get(`/cms/.strapi/client/vite-compat-probe.css?direct&t=${Date.now()}`);
    assert.match(changedCss.body, /rgb\(4, 5, 6\)/);
    check("real adapter JS/CSS, catalog lazy JSX, same-port HMR handshake and JS/CSS update/refetch");
    for (const url of [
      "/cms/.strapi/client/.env.vite-compat", "/cms/.strapi/client/.env.vite-compat?raw",
      "/cms/.strapi/client/.env.vite-compat?import&raw", `/cms/@fs${deniedPath}?raw`,
      `/cms/@fs${outside}?raw`, `/cms/@fs${outside}?import&raw`,
    ]) {
      const result = await get(url);
      assert.ok([403, 404].includes(result.response.status), `denied file status ${url}: ${result.response.status}`);
      assert.ok(!result.body.includes(marker), "sentinel never disclosed");
    }
    check("six local sensitive/out-of-root file probes denied without sentinel disclosure (Linux only)");
  } finally {
    if (socket) socket.close();
    for (const file of created) await fs.rm(file, { force: true });
  }
}
async function main() {
  if (mode === "build") return assets();
  if (mode === "stopped") {
    const port = Number(new URL(base).port);
    await new Promise((resolve, reject) => {
      const server = net.createServer(); server.once("error", reject);
      server.listen(port, "127.0.0.1", () => server.close(resolve));
    });
    return check("server stopped and loopback port released");
  }
  assert.ok(["built", "cold", "warm"].includes(mode));
  await routes();
  if (mode === "built") {
    const files = await assets();
    for (const file of files) {
      const result = await get(`/cms/${file}`);
      assert.equal(result.response.status, 200, file);
      assert.match(result.response.headers.get("content-type"), file.endsWith(".css") ? /css/ : /javascript/, file);
      assert.ok(result.body.length > 0);
    }
    check(`all ${files.length} built JS/CSS assets served through Strapi`);
  } else await watch();
}
main().catch(error => { console.error(error); process.exitCode = 1; });
