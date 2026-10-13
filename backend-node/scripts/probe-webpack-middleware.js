"use strict";

// Disposable, loopback-only acceptance of Strapi's resolved middleware and its
// official Koa bridge. This does not start Strapi or change installed packages.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const { createRequire } = require("node:module");
const { createHash, randomUUID } = require("node:crypto");
const { setTimeout: delay } = require("node:timers/promises");

const appDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
if (args.some((arg) => !["--write-results", "--with-head-cleanup"].includes(arg))) {
  throw new Error("Usage: node scripts/probe-webpack-middleware.js [--write-results] [--with-head-cleanup]");
}
const withHeadCleanup = args.includes("--with-head-cleanup");
const closeHeadStream = withHeadCleanup ? require("./strapi-webpack-patch").closeHeadStream : undefined;
if (withHeadCleanup) assert.equal(typeof closeHeadStream, "function", "application-owned HEAD cleanup hook must be exported");
const fromStrapi = createRequire(require.resolve("@strapi/strapi/package.json"));
const webpack = fromStrapi("webpack");
const middleware = fromStrapi("webpack-dev-middleware");
const Koa = fromStrapi("koa");
const versions = Object.fromEntries(["webpack", "webpack-dev-middleware", "koa"]
  .map((name) => [name, fromStrapi(`${name}/package.json`).version]));
assert.equal(versions["webpack-dev-middleware"], "7.4.6");
assert.match(versions.webpack, /^5\./);

// Always use an application-workspace temporary directory, even if the caller's
// TMPDIR points outside it. All disk fixtures are removed in main's finally.
const tempRoot = path.join(appDir, ".tmp");
fs.mkdirSync(tempRoot, { recursive: true });
const fixture = fs.mkdtempSync(path.join(tempRoot, "webpack-protocol-"));
process.env.TMPDIR = fixture;
assert.equal(os.tmpdir(), fixture);
const textAsset = Buffer.from("webpack Koa protocol fixture\n".repeat(4096));
const binaryAsset = Buffer.from(Array.from({ length: 4096 }, (_, index) => index % 256));
const abortAsset = Buffer.alloc(2 * 1024 * 1024, 0xa5);
const sentinel = Buffer.from(`disposable-sibling-sentinel-${randomUUID()}`);
const results = {
  schemaVersion: 1,
  command: `node scripts/probe-webpack-middleware.js${withHeadCleanup ? " --with-head-cleanup" : ""} --write-results`,
  adapterMode: withHeadCleanup ? "application-owned HEAD cleanup via modifyResponseData" : "upstream koaWrapper without HEAD cleanup",
  versions,
  startedAt: new Date().toISOString(),
  scope: "Installed webpack 5 + Koa + webpack-dev-middleware.koaWrapper; loopback HTTP; disposable memory output; no Strapi server",
  profiles: [],
};
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const watchdog = setTimeout(() => {
  console.error("Protocol probe exceeded its 90-second hard limit");
  process.exit(1);
}, 90_000);

async function bounded(promise, label, ms = 5000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

async function eventually(predicate, label) {
  const deadline = Date.now() + 3000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, `${label} did not complete within 3 seconds`);
    await delay(15);
  }
}

function request(port, url, { method = "GET", headers = {} } = {}) {
  return bounded(new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: url, method, headers, agent: false }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("error", reject);
      res.on("end", () => {
        const body = Buffer.concat(chunks);
        if (body.includes(sentinel)) return reject(new Error("Sibling sentinel leaked over HTTP"));
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.setTimeout(3000, () => req.destroy(new Error("HTTP request timeout")));
    req.on("error", reject);
    req.end();
  }), `request ${method} ${url}`);
}

function responseSummary(response) {
  return {
    status: response.status,
    bytes: response.body.length,
    bodySha256: sha256(response.body),
    headers: Object.fromEntries(["content-type", "content-length", "content-range", "accept-ranges", "etag", "last-modified", "x-probe-fallback"]
      .filter((name) => response.headers[name] !== undefined).map((name) => [name, response.headers[name]])),
  };
}

async function rawNulRequest(port) {
  return bounded(new Promise((resolve, reject) => {
    const socket = net.connect(port, "127.0.0.1");
    let response = "";
    socket.setTimeout(3000, () => socket.destroy(new Error("Raw request timeout")));
    socket.on("error", reject);
    socket.on("data", (chunk) => { response += chunk.toString("latin1"); });
    socket.on("end", () => resolve(response));
    socket.on("connect", () => socket.end("GET /assets/\0bad HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"));
  }), "raw NUL HTTP parser rejection");
}

async function abortRequest(port) {
  return bounded(new Promise((resolve, reject) => {
    const req = http.get({ hostname: "127.0.0.1", port, path: "/assets/abort.bin", agent: false }, (res) => {
      let bytes = 0;
      res.once("data", (chunk) => {
        bytes += chunk.length;
        const outcome = { status: res.statusCode, receivedBytes: bytes, advertisedBytes: Number(res.headers["content-length"]) };
        res.destroy();
        req.destroy();
        resolve(outcome);
      });
      res.on("error", (error) => { if (error.code !== "ECONNRESET") reject(error); });
    });
    req.setTimeout(3000, () => req.destroy(new Error("Abort request timeout")));
    req.on("error", (error) => { if (error.code !== "ECONNRESET") reject(error); });
  }), "client abort");
}

async function profile(name, publicPath, options) {
  const summary = {
    name, publicPath,
    middlewareOptions: Object.fromEntries(Object.entries(options).map(([key, value]) => [key, typeof value === "function" ? "application-owned closeHeadStream" : value])),
    checks: [], observations: {},
  };
  results.profiles.push(summary);
  async function check(label, fn) {
    try {
      const evidence = await fn();
      summary.checks.push({ name: label, passed: true, ...(evidence === undefined ? {} : { evidence }) });
      console.log(`PASS ${name}: ${label}`);
    } catch (error) {
      summary.checks.push({ name: label, passed: false, error: error.message });
      console.error(`FAIL ${name}: ${label}: ${error.message}`);
    }
  }

  const directory = path.join(fixture, name);
  fs.mkdirSync(directory);
  const entry = path.join(directory, "entry.js");
  fs.writeFileSync(entry, 'console.log("disposable webpack acceptance");\n');
  const outputPath = path.join(directory, "output");
  const compiler = webpack({
    mode: "development", context: directory, entry, devtool: false, cache: false,
    output: { path: outputPath, publicPath, filename: "bundle.js" },
    infrastructureLogging: { level: "none" }, stats: "none",
    plugins: [{ apply(currentCompiler) {
      currentCompiler.hooks.thisCompilation.tap("ProtocolFixture", (compilation) => {
        compilation.hooks.processAssets.tap({ name: "ProtocolFixture", stage: webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL }, () => {
          for (const [filename, data] of [["text.txt", textAsset], ["binary.bin", binaryAsset], ["empty.txt", Buffer.alloc(0)], ["abort.bin", abortAsset]]) {
            compilation.emitAsset(filename, new webpack.sources.RawSource(data));
          }
        });
      });
    } }],
  });
  const wrapped = middleware.koaWrapper(compiler, options);
  const devMiddleware = wrapped.devMiddleware;
  const app = new Koa();
  const errors = [];
  const state = { fallbackCalls: 0, responses: [], streams: [] };
  const sockets = new Set();
  const server = http.createServer(app.callback());
  let port;
  let outputFs;
  app.on("error", (error) => errors.push({ code: error.code, message: error.message }));
  app.use(async (ctx, next) => {
    const observation = { url: ctx.req.url, method: ctx.method, beforeStatus: ctx.status };
    state.responses.push(observation);
    ctx.res.once("close", () => { observation.responseClosed = true; observation.responseFinished = ctx.res.writableFinished; });
    await next();
    observation.afterStatus = ctx.status;
    observation.streamBody = Boolean(ctx.body && typeof ctx.body.pipe === "function");
    observation.fallback = ctx.response.get("X-Probe-Fallback") === "yes";
  });
  // Match the application-owned watcher patch's readiness boundary.
  app.use(async (ctx, next) => {
    await new Promise((resolve) => devMiddleware.waitUntilValid(resolve));
    await wrapped(ctx, next);
  });
  app.use((ctx) => {
    state.fallbackCalls += 1;
    ctx.status = 404;
    ctx.set("X-Probe-Fallback", "yes");
    ctx.body = "isolated application fallback";
  });
  server.on("connection", (socket) => { sockets.add(socket); socket.on("close", () => sockets.delete(socket)); });

  try {
    const stats = await bounded(new Promise((resolve) => devMiddleware.waitUntilValid(resolve)), "webpack compilation", 20_000);
    assert.equal(stats.hasErrors(), false, stats.toString({ all: false, errors: true }));
    outputFs = devMiddleware.context.outputFileSystem;
    outputFs.writeFileSync(path.join(directory, "sentinel.txt"), sentinel);
    assert.deepEqual(outputFs.readFileSync(path.join(directory, "sentinel.txt")), sentinel);
    assert.equal(fs.existsSync(path.join(directory, "sentinel.txt")), false);
    const originalCreateReadStream = outputFs.createReadStream.bind(outputFs);
    outputFs.createReadStream = (filename, streamOptions) => {
      const stream = originalCreateReadStream(filename, streamOptions);
      const currentRequest = state.responses.at(-1);
      state.streams.push({ filename: path.basename(filename), method: currentRequest?.method, url: currentRequest?.url, stream });
      if (path.basename(filename) === "abort.bin") {
        // Pace only this disposable fixture's genuine memfs stream so loopback
        // cannot buffer the entire file before the client has a chance to abort.
        // Ordinary GET/HEAD and all protocol assertions use unmodified streams.
        const originalRead = stream._read;
        let timer;
        stream._read = function readPaced(size) {
          timer = setTimeout(() => { if (!this.destroyed) originalRead.call(this, size); }, 2);
        };
        stream.once("close", () => clearTimeout(timer));
      }
      return stream;
    };
    await bounded(new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    }), "loopback listen");
    port = server.address().port;

    await check("streamed GET, MIME, length and next isolation", async () => {
      const before = state.fallbackCalls;
      const response = await request(port, "/assets/text.txt");
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, textAsset);
      assert.equal(response.headers["content-length"], String(textAsset.length));
      assert.match(response.headers["content-type"], /^text\/plain; charset=utf-8$/i);
      assert.equal(response.headers["accept-ranges"], "bytes");
      assert.equal(response.headers["x-probe-fallback"], undefined);
      assert.equal(state.fallbackCalls, before);
      assert.equal(state.responses.at(-1).streamBody, true);
      assert.equal(state.responses.at(-1).beforeStatus, 404);
      assert.equal(state.responses.at(-1).afterStatus, 200);
      return responseSummary(response);
    });
    await check("HEAD returns headers with no body", async () => {
      const response = await request(port, "/assets/text.txt", { method: "HEAD" });
      assert.equal(response.status, 200);
      assert.equal(response.body.length, 0);
      assert.equal(response.headers["content-length"], String(textAsset.length));
      assert.match(response.headers["content-type"], /^text\/plain;/);
      assert.equal(response.headers["x-probe-fallback"], undefined);
      return responseSummary(response);
    });
    await check("binary and zero-byte responses", async () => {
      const binary = await request(port, "/assets/binary.bin");
      assert.equal(binary.status, 200);
      assert.deepEqual(binary.body, binaryAsset);
      assert.equal(binary.headers["content-type"], "application/octet-stream");
      assert.equal(binary.headers["content-length"], String(binaryAsset.length));
      const empty = await request(port, "/assets/empty.txt");
      assert.equal(empty.status, 200);
      assert.equal(empty.body.length, 0);
      assert.equal(empty.headers["content-length"], "0");
      return { binary: responseSummary(binary), empty: responseSummary(empty) };
    });
    await check("single byte range 206 and unsatisfiable range 416", async () => {
      const partial = await request(port, "/assets/binary.bin", { headers: { Range: "bytes=3-10" } });
      assert.equal(partial.status, 206);
      assert.deepEqual(partial.body, binaryAsset.subarray(3, 11));
      assert.equal(partial.headers["content-length"], "8");
      assert.equal(partial.headers["content-range"], `bytes 3-10/${binaryAsset.length}`);
      const unsatisfiable = await request(port, "/assets/binary.bin", { headers: { Range: `bytes=${binaryAsset.length}-` } });
      assert.equal(unsatisfiable.status, 416);
      assert.equal(unsatisfiable.headers["content-range"], `bytes */${binaryAsset.length}`);
      assert.match(unsatisfiable.body.toString(), /Range Not Satisfiable/);
      assert.equal(Number(unsatisfiable.headers["content-length"]), unsatisfiable.body.length);
      return { partial: responseSummary(partial), unsatisfiable: responseSummary(unsatisfiable) };
    });
    if (withHeadCleanup) {
      await check("HEAD cleanup preserves partial, unsatisfiable and empty responses", async () => {
        const partial = await request(port, "/assets/binary.bin", { method: "HEAD", headers: { Range: "bytes=3-10" } });
        assert.equal(partial.status, 206);
        assert.equal(partial.body.length, 0);
        assert.equal(partial.headers["content-length"], "8");
        assert.equal(partial.headers["content-range"], `bytes 3-10/${binaryAsset.length}`);
        assert.equal(partial.headers["content-type"], "application/octet-stream");
        const unsatisfiable = await request(port, "/assets/binary.bin", { method: "HEAD", headers: { Range: `bytes=${binaryAsset.length}-` } });
        assert.equal(unsatisfiable.status, 416);
        assert.equal(unsatisfiable.body.length, 0);
        assert.equal(unsatisfiable.headers["content-range"], `bytes */${binaryAsset.length}`);
        const empty = await request(port, "/assets/empty.txt", { method: "HEAD" });
        assert.equal(empty.status, 200);
        assert.equal(empty.body.length, 0);
        assert.equal(empty.headers["content-length"], "0");
        assert.match(empty.headers["content-type"], /^text\/plain;/);
        for (const response of [partial, unsatisfiable, empty]) assert.equal(response.headers["x-probe-fallback"], undefined);
        return { partial: responseSummary(partial), unsatisfiable: responseSummary(unsatisfiable), empty: responseSummary(empty) };
      });
    }
    await check(options.etag ? "explicit validators produce conditional 304" : "fresh defaults do not add validators", async () => {
      const first = await request(port, "/assets/text.txt");
      if (!options.etag) {
        assert.equal(first.headers.etag, undefined);
        assert.equal(first.headers["last-modified"], undefined);
        const conditional = await request(port, "/assets/text.txt", { headers: { "If-None-Match": '"unrelated-probe-validator"' } });
        assert.equal(conditional.status, 200);
        assert.deepEqual(conditional.body, textAsset);
        return { first: responseSummary(first), conditional: responseSummary(conditional) };
      }
      assert.match(first.headers.etag, /^W\//);
      assert.ok(Number.isFinite(Date.parse(first.headers["last-modified"])));
      const responses = [];
      for (const headers of [{ "If-None-Match": first.headers.etag }, { "If-Modified-Since": first.headers["last-modified"] }]) {
        const conditional = await request(port, "/assets/text.txt", { headers });
        assert.equal(conditional.status, 304);
        assert.equal(conditional.body.length, 0);
        assert.equal(conditional.headers["content-length"], undefined);
        assert.equal(conditional.headers["x-probe-fallback"], undefined);
        responses.push(responseSummary(conditional));
      }
      return { first: responseSummary(first), conditional: responses };
    });
    if (withHeadCleanup) {
      await check("HEAD cleanup preserves default and explicit-validator conditional status", async () => {
        const first = await request(port, "/assets/text.txt");
        const stale = await request(port, "/assets/text.txt", { method: "HEAD", headers: { "If-None-Match": '"unrelated-probe-validator"' } });
        assert.equal(stale.status, 200);
        assert.equal(stale.body.length, 0);
        assert.equal(stale.headers["content-length"], String(textAsset.length));
        assert.equal(stale.headers["x-probe-fallback"], undefined);
        const conditional = [];
        if (options.etag) {
          for (const headers of [{ "If-None-Match": first.headers.etag }, { "If-Modified-Since": first.headers["last-modified"] }]) {
            const response = await request(port, "/assets/text.txt", { method: "HEAD", headers });
            assert.equal(response.status, 304);
            assert.equal(response.body.length, 0);
            assert.equal(response.headers["content-length"], undefined);
            assert.equal(response.headers["x-probe-fallback"], undefined);
            conditional.push(responseSummary(response));
          }
        } else {
          assert.equal(stale.headers.etag, undefined);
          assert.equal(stale.headers["last-modified"], undefined);
        }
        return { stale: responseSummary(stale), conditional };
      });
    }
    await check("missing paths and unsupported methods call only fallback", async () => {
      const before = state.fallbackCalls;
      const responses = [];
      for (const [url, method] of [["/assets/missing.txt", "GET"], ["/unrelated/text.txt", "GET"], ["/assets/text.txt", "POST"]]) {
        const response = await request(port, url, { method });
        assert.equal(response.status, 404);
        assert.equal(response.headers["x-probe-fallback"], "yes");
        assert.equal(response.body.toString(), "isolated application fallback");
        responses.push({ url, method, ...responseSummary(response) });
      }
      assert.equal(state.fallbackCalls, before + 3);
      return responses;
    });
    await check("malformed percent URLs fall through; encoded and literal NUL reject", async () => {
      const responses = [];
      for (const url of ["/assets/%", "/assets/%zz", "/assets/%E0%A4%A"]) {
        const response = await request(port, url);
        assert.equal(response.status, 404);
        assert.equal(response.headers["x-probe-fallback"], "yes");
        responses.push({ url, ...responseSummary(response) });
      }
      const nul = await request(port, "/assets/%00bad");
      assert.equal(nul.status, 400);
      assert.match(nul.body.toString(), /Bad Request/);
      assert.equal(nul.headers["x-probe-fallback"], undefined);
      const raw = await rawNulRequest(port);
      assert.match(raw, /^HTTP\/1\.1 400 Bad Request\r\n/);
      assert.ok(!raw.includes(sentinel.toString()));
      return { malformed: responses, encodedNul: responseSummary(nul), literalNulHttpStatus: 400 };
    });
    await check("sibling traversal cannot escape memory output; healthy before and after", async () => {
      const before = await request(port, "/assets/text.txt");
      assert.equal(before.status, 200);
      assert.deepEqual(before.body, textAsset);
      const attacks = [];
      for (const url of ["/assets../sentinel.txt", "/assets%2e%2e/sentinel.txt", "/assets..%2fsentinel.txt", "/assets/../sentinel.txt", "/assets/%2e%2e/sentinel.txt"]) {
        const response = await request(port, url);
        const expectedStatus = publicPath.endsWith("/") && !decodeURIComponent(url).startsWith(publicPath) ? 404 : 403;
        assert.equal(response.status, expectedStatus);
        assert.ok(!response.body.includes(sentinel));
        if (expectedStatus === 403) {
          assert.match(response.body.toString(), /Forbidden/);
          assert.equal(response.headers["x-probe-fallback"], undefined);
        } else {
          assert.equal(response.headers["x-probe-fallback"], "yes");
        }
        attacks.push({ url, ...responseSummary(response) });
      }
      const after = await request(port, "/assets/text.txt");
      assert.equal(after.status, 200);
      assert.deepEqual(after.body, before.body);
      assert.deepEqual(outputFs.readFileSync(path.join(directory, "sentinel.txt")), sentinel);
      // Demonstrate that the non-slash prefix vector targets the present sibling,
      // without importing an old vulnerable package or weakening this middleware.
      const stripped = "/assets../sentinel.txt".slice("/assets".length);
      assert.equal(path.join(outputPath, stripped), path.join(directory, "sentinel.txt"));
      return { before: responseSummary(before), attacks, after: responseSummary(after), sentinelStayedInMemory: true, sentinelLeaked: false };
    });
    await check("client abort destroys stream; subsequent GET succeeds", async () => {
      const outcome = await abortRequest(port);
      assert.equal(outcome.status, 200);
      assert.ok(outcome.receivedBytes > 0 && outcome.receivedBytes < outcome.advertisedBytes);
      const tracked = state.streams.find((item) => item.filename === "abort.bin");
      assert.ok(tracked, "abort request used a real memory filesystem stream");
      await eventually(() => tracked.stream.destroyed, "aborted response stream destruction");
      await eventually(() => state.responses.some((item) => item.url === "/assets/abort.bin" && item.responseClosed), "aborted response close");
      assert.equal(state.responses.find((item) => item.url === "/assets/abort.bin").responseFinished, false, "abort reached the server before it finished the response");
      const after = await request(port, "/assets/text.txt");
      assert.equal(after.status, 200);
      assert.deepEqual(after.body, textAsset);
      return { ...outcome, fixtureReadPacingMs: 2, streamDestroyed: tracked.stream.destroyed, responseFinished: false, after: responseSummary(after) };
    });
    await check("no unexpected Koa application errors", async () => {
      assert.deepEqual(errors.filter((error) => !["ECONNRESET", "EPIPE"].includes(error.code)), []);
      return { expectedClientAbortErrors: errors };
    });
  } catch (error) {
    summary.checks.push({ name: "fixture setup and execution", passed: false, error: error.stack });
  } finally {
    await check("bounded watcher/server shutdown and released loopback port", async () => {
      const started = Date.now();
      for (const socket of sockets) socket.destroy();
      if (server.listening) await bounded(new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())), "HTTP server close");
      await bounded(new Promise((resolve, reject) => devMiddleware.close((error) => error ? reject(error) : resolve())), "middleware watcher close");
      await bounded(new Promise((resolve, reject) => compiler.close((error) => error ? reject(error) : resolve())), "webpack compiler close");
      if (port) {
        const rebound = net.createServer();
        try {
          await bounded(new Promise((resolve, reject) => { rebound.once("error", reject); rebound.listen(port, "127.0.0.1", resolve); }), "released port rebind");
        } finally {
          if (rebound.listening) await new Promise((resolve) => rebound.close(resolve));
        }
      }
      return { elapsedMs: Date.now() - started, portRebound: Boolean(port) };
    });
    summary.observations.streamsCreated = state.streams.length;
    summary.observations.streamsNotDestroyedAfterShutdown = state.streams.filter(({ stream }) => !stream.destroyed)
      .map(({ filename, method, url, stream }) => {
        let memoryFdOpen = false;
        if (typeof stream.fd === "number") {
          try { memoryFdOpen = outputFs.fstatSync(stream.fd).isFile(); } catch { /* Already closed. */ }
        }
        return { filename, method, url, closed: stream.closed, readableEnded: stream.readableEnded, memoryFdOpen };
      });
    await check("response streams are released after middleware shutdown", async () => {
      assert.deepEqual(summary.observations.streamsNotDestroyedAfterShutdown, [], "upstream HEAD response left an open memory-filesystem read stream");
    });
    // Cleanup belongs to this test fixture. Preserve the pre-cleanup observation
    // above so the harness cannot hide an upstream resource-lifecycle issue.
    for (const { stream } of state.streams) if (!stream.destroyed) stream.destroy();
    for (const socket of sockets) socket.destroy();
  }
}

function compactReport() {
  return {
    ...results,
    profiles: results.profiles.map((item) => {
      const find = (prefix) => item.checks.find((check) => check.name.startsWith(prefix))?.evidence;
      const containment = find("sibling traversal");
      const validators = find("fresh defaults") || find("explicit validators");
      return {
        name: item.name, publicPath: item.publicPath, middlewareOptions: item.middlewareOptions,
        checks: Object.fromEntries(item.checks.map((check) => [check.name, check.passed ? "pass" : `FAIL: ${check.error.split("\n")[0]}`])),
        containment: containment && {
          beforeStatus: containment.before.status,
          afterStatus: containment.after.status,
          bodyUnchanged: containment.before.bodySha256 === containment.after.bodySha256,
          attacks: containment.attacks.map(({ url, status }) => ({ url, status })),
          sentinelStayedInMemory: containment.sentinelStayedInMemory,
          sentinelLeaked: containment.sentinelLeaked,
        },
        validators: validators && {
          etagEmitted: validators.first.headers.etag !== undefined,
          lastModifiedEmitted: validators.first.headers["last-modified"] !== undefined,
          conditionalStatuses: [].concat(validators.conditional).map(({ status }) => status),
        },
        ...(withHeadCleanup ? {
          headResponses: find("HEAD cleanup preserves partial") && Object.fromEntries(Object.entries(find("HEAD cleanup preserves partial")).map(([label, response]) => [label, { status: response.status, bytes: response.bytes, headers: response.headers }])),
          headConditional: find("HEAD cleanup preserves default") && { staleStatus: find("HEAD cleanup preserves default").stale.status, conditionalStatuses: find("HEAD cleanup preserves default").conditional.map(({ status }) => status) },
        } : {}),
        abort: find("client abort") && { ...find("client abort"), after: { status: find("client abort").after.status, bytes: find("client abort").after.bytes } },
        shutdown: find("bounded watcher"),
        observations: item.observations,
      };
    }),
    limitations: [
      "This does not establish actual Strapi webpack, HMR/SSE, Vite, browser, or production compatibility.",
      "The abort-only memory stream is paced by 2 ms per read to ensure the client disconnect reaches the server before completion; all other streams are unmodified.",
      withHeadCleanup
        ? "HEAD cleanup is an application-owned hook using the documented modifyResponseData option; it is not an upstream middleware fix. The unchanged no-hook failure is preserved in webpack-protocol-results.json."
        : "Middleware 7.4.6 creates a HEAD read stream before its early return, bypassing its later stream cleanup registration (dist/middleware.js:624-650 and 661-677). The harness records the open descriptor before destroying fixture streams itself.",
    ],
  };
}

async function main() {
  try {
    const cleanupOptions = withHeadCleanup ? { modifyResponseData: closeHeadStream } : {};
    await profile("slash-defaults", "/assets/", { ...cleanupOptions });
    await profile("non-slash-defaults", "/assets", { ...cleanupOptions });
    await profile("explicit-validators", "/assets/", { ...cleanupOptions, etag: "weak", lastModified: true });
  } catch (error) {
    results.fatalError = error.stack;
    throw error;
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
    // A failed close must not turn a bounded test into an indefinitely hung
    // process. This timer won't keep a correctly cleaned-up process alive.
    watchdog.unref();
    results.finishedAt = new Date().toISOString();
    results.passed = !results.fatalError && results.profiles.length === 3 && results.profiles.every((item) => item.checks.length > 0 && item.checks.every((check) => check.passed));
    results.checksPassed = results.profiles.flatMap((item) => item.checks).filter((check) => check.passed).length;
    results.checksFailed = results.profiles.flatMap((item) => item.checks).filter((check) => !check.passed).length;
    results.fixtureRemoved = !fs.existsSync(fixture);
    if (args.includes("--write-results")) {
      fs.mkdirSync(path.join(appDir, "docs"), { recursive: true });
      const filename = withHeadCleanup ? "webpack-protocol-head-cleanup-results.json" : "webpack-protocol-results.json";
      fs.writeFileSync(path.join(appDir, "docs", filename), `${JSON.stringify(compactReport(), null, 2)}\n`);
    }
    console.log(JSON.stringify({ passed: results.passed, checksPassed: results.checksPassed, checksFailed: results.checksFailed, fixtureRemoved: results.fixtureRemoved }));
    if (!results.passed) process.exitCode = 1;
  }
}

main().catch((error) => { console.error(error.stack); process.exitCode = 1; });
