"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const http = require("node:http");
const { setTimeout: delay } = require("node:timers/promises");
const { randomUUID } = require("node:crypto");
const base = new URL(process.env.WEBPACK_COMPAT_URL);
assert.equal(base.protocol, "http:");
assert.equal(base.hostname, "127.0.0.1");
const root = path.resolve(__dirname, "..");
const get = async (url) => {
  const response = await fetch(new URL(url, base), { signal: AbortSignal.timeout(30000) });
  return { response, body: await response.text() };
};
const pass = message => console.log(`PASS ${message}`);
async function until(fn, message, timeout = 180000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await fn();
    if (value) return value;
    await delay(100);
  }
  throw new Error(message);
}
async function main() {
  await until(async () => {
    try { return (await get("/api/v1/readiness")).response.ok; } catch { return false; }
  }, "Strapi webpack readiness timed out");
  for (const route of ["/cms/", "/cms/auth/login", "/cms/plugins/alageum-catalog", "/cms/content-manager"]) {
    const html = await get(route);
    assert.equal(html.response.status, 200, route);
    assert.match(html.response.headers.get("content-type"), /html/);
    const assets = [...html.body.matchAll(/(?:src|href)="(\/cms\/[^"?]+\.(?:js|css))"/g)].map(match => match[1]);
    assert.ok(assets.some(asset => asset.endsWith(".js")), "webpack entry found in generated HTML");
    for (const asset of assets) {
      const result = await get(asset);
      assert.equal(result.response.status, 200, asset);
      assert.match(result.response.headers.get("content-type"), asset.endsWith(".css") ? /css/ : /javascript/);
    }
  }
  const missing = await get("/api/v1/webpack-missing-probe");
  assert.equal(missing.response.status, 404);
  assert.match(missing.response.headers.get("content-type"), /json/);
  assert.equal((await get("/alageum-catalog/products")).response.status, 401);
  pass("real webpack CMS entry/assets/deep routes and business/CMS API isolation");
  const events = [];
  let sseError;
  const request = http.get(new URL("/__webpack_hmr", base), { headers: { Accept: "text/event-stream" } });
  const connected = new Promise((resolve, reject) => {
    request.on("error", reject);
    request.on("response", response => {
      try { assert.equal(response.statusCode, 200); assert.match(response.headers["content-type"], /text\/event-stream/); }
      catch (error) { reject(error); return; }
      response.setEncoding("utf8");
      let buffer = "";
      response.on("data", chunk => {
        buffer += chunk;
        const frames = buffer.split("\n\n"); buffer = frames.pop();
        for (const frame of frames) for (const line of frame.split("\n")) {
          if (line.startsWith("data: ")) {
            try { events.push(JSON.parse(line.slice(6))); } catch { /* heartbeat */ }
          }
        }
      });
      response.on("error", error => { sseError = error; });
      resolve();
    });
  });
  const entryPath = path.join(root, ".strapi/client/app.js");
  const probePath = path.join(root, ".strapi/client/webpack-compat-probe.js");
  const original = await fs.readFile(entryPath, "utf8");
  const marker = `webpack-compat-${randomUUID()}`;
  const content = suffix => `globalThis.__alageumWebpackCompat = ${JSON.stringify(marker + suffix)};\nif (module.hot) module.hot.accept();\n`;
  let created = false;
  async function buildAfter(index, expectErrors = false) {
    return until(() => {
      if (sseError) throw sseError;
      return events.slice(index).find(event => event.action === "built" && Boolean(event.errors?.length) === expectErrors);
    }, `No ${expectErrors ? "failed" : "successful"} webpack HMR build event`, 90000);
  }
  try {
    let timer;
    try {
      await Promise.race([connected, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("SSE connection timeout")), 15000);
      })]);
    } finally { clearTimeout(timer); }
    const sync = await until(() => events.find(event => event.action === "sync"), "SSE initial sync timeout", 15000);
    assert.deepEqual(sync.errors, [], "initial webpack compilation must be error-free before HMR/browser acceptance");
    let index = events.length;
    await fs.writeFile(probePath, content("before"), { flag: "wx" }); created = true;
    await fs.writeFile(entryPath, original + "\nimport './webpack-compat-probe.js';\n");
    const before = await buildAfter(index);
    assert.match((await get("/cms/main.js")).body, new RegExp(marker + "before"));
    index = events.length;
    await fs.writeFile(probePath, content("after"));
    const after = await buildAfter(index);
    assert.notEqual(after.hash, before.hash);
    const manifest = await get(`/cms/main.${before.hash}.hot-update.json`);
    assert.equal(manifest.response.status, 200);
    const chunks = JSON.parse(manifest.body).c;
    assert.ok(chunks.length > 0);
    for (const chunk of chunks) {
      const update = await get(`/cms/${chunk}.${before.hash}.hot-update.js`);
      assert.equal(update.response.status, 200);
      assert.match(update.body, new RegExp(marker + "after"));
    }
    pass("SSE sync/build events and matching changed hot-update manifest/chunks");
    index = events.length;
    await fs.writeFile(probePath, "export const = ;\n");
    await buildAfter(index, true);
    index = events.length;
    await fs.writeFile(probePath, content("recovered"));
    await buildAfter(index);
    assert.match((await get("/cms/main.js")).body, new RegExp(marker + "recovered"));
    pass("webpack syntax-error rebuild and recovery without restarting Strapi");
  } finally {
    request.destroy();
    await fs.writeFile(entryPath, original);
    if (created) await fs.rm(probePath, { force: true });
  }
  assert.equal((await get("/api/v1/readiness")).response.status, 200);
  pass("SSE disconnect preserves server readiness; synthetic source restored");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
