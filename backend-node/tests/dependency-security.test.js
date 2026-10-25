"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { once } = require("node:events");
const { Readable } = require("node:stream");
const { test } = require("node:test");
const { createRequire } = require("node:module");

const appRoot = path.resolve(__dirname, "..");
const fromCore = createRequire(require.resolve("@strapi/core/package.json"));
const coreRoot = path.dirname(fromCore.resolve("@strapi/core/package.json"));
const coreModule = (relative) => require(path.join(coreRoot, "dist", relative));

test("reviewed dependency patches resolve from the actual Strapi consumers", () => {
  const lock = require("../package-lock.json");
  const pins = {
    dompurify: "3.4.17",
    "markdown-it": "14.3.3",
    vite: "6.4.5",
    "@modelcontextprotocol/server": "2.3.1",
    "@modelcontextprotocol/core": "2.3.1",
    "@modelcontextprotocol/node": "2.1.1",
  };
  for (const [name, version] of Object.entries(pins)) {
    const installed = JSON.parse(fs.readFileSync(path.join(appRoot, "node_modules", name, "package.json"), "utf8"));
    assert.equal(installed.version, version, name);
    const entries = Object.entries(lock.packages).filter(([key]) => key.endsWith(`/node_modules/${name}`) || key === `node_modules/${name}`);
    assert.ok(entries.length > 0, name);
    for (const [key, entry] of entries) assert.equal(entry.version, version, key);
  }
  for (const name of ["@modelcontextprotocol/server", "@modelcontextprotocol/node"]) {
    assert.equal(fromCore.resolve(name), require.resolve(name), `${name} must not resolve an older nested copy`);
  }
  assert.equal(require("@strapi/strapi/package.json").version, "5.56.0");
});

test("patched markdown-it retains Strapi's configured rich-text plugins", () => {
  const Markdown = require("markdown-it");
  const md = new Markdown({ html: true, breaks: true, linkify: true, typographer: true });
  for (const plugin of ["abbr", "deflist", "emoji", "footnote", "ins", "mark", "sub", "sup"]) {
    md.use(require(`markdown-it-${plugin}`));
  }
  md.use(require("markdown-it-container"), "warning");
  md.use(require("markdown-it-container"), "tip");
  const rendered = md.render("# Equipment\n\n**Transformer** [catalogue](/catalog)\n\n==Rated power== H~2~O x^2^ ++inserted++ :smile:\n\n::: warning\nCheck rating\n:::\n\nA note[^1].\n\n[^1]: Certified\n");
  for (const fragment of ["<h1>Equipment</h1>", "<strong>Transformer</strong>", 'href="/catalog"', "<mark>Rated power</mark>", "<sub>2</sub>", "<sup>2</sup>", "<ins>inserted</ins>", 'class="warning"', "Certified"]) {
    assert.ok(rendered.includes(fragment), fragment);
  }
  assert.ok(!md.render("[bad](javascript:alert(1))").includes('href="javascript:'));
});

test("Strapi's retained JSONL transfer parser preserves own prototype-named keys", async () => {
  // stream-json's general Assembler/filter advisories remain open. This checks
  // only the JSONL API actually imported by Strapi's file/directory providers.
  const fromTransfer = createRequire(require.resolve("@strapi/data-transfer/package.json"));
  const Parser = fromTransfer("stream-json/jsonl/Parser");
  const input = '{"__proto__":{"alageumPolluted":true},"name":"Трансформатор"}\n{"ok":true}\n';
  const parsed = [];
  for await (const item of Readable.from([input.slice(0, 17), input.slice(17, 51), input.slice(51)]).pipe(Parser.make())) parsed.push(item.value);
  assert.equal(parsed.length, 2);
  assert.equal(Object.getPrototypeOf(parsed[0]), Object.prototype);
  assert.ok(Object.hasOwn(parsed[0], "__proto__"));
  assert.equal(parsed[0].__proto__.alageumPolluted, true);
  assert.equal(parsed[0].alageumPolluted, undefined);
  assert.equal({}.alageumPolluted, undefined);
  assert.equal(parsed[0].name, "Трансформатор");
  assert.deepEqual(parsed[1], { ok: true });
});

function parseRpc(text) {
  if (text.trim().startsWith("{")) return JSON.parse(text);
  const data = text.split("\n").find((line) => line.startsWith("data: "));
  assert.ok(data, `Expected JSON-RPC response, got ${text}`);
  return JSON.parse(data.slice(6));
}

test("patched MCP SDK supports Strapi's per-request lifecycle and isolates concurrent users", { timeout: 20000 }, async (t) => {
  const { createPostHandler } = coreModule("services/mcp/handlers/handlePost.js");
  const { createMcpServerWithRegistries } = coreModule("services/mcp/internal/McpServerFactory.js");
  const { z } = require("@strapi/utils");
  const errors = [];
  const created = new Set();
  const strapi = { telemetry: { send: async () => {} }, log: { error: (...args) => errors.push(args) } };
  const definition = {
    name: "current-test-user",
    description: "Return only this synthetic request's identity",
    auth: { policies: [{ action: "test.read" }] },
    resolveOutputSchema: () => z.object({ userId: z.string() }),
    createHandler: (_strapi, context) => async () => ({ content: [{ type: "text", text: context.user.id }], structuredContent: { userId: context.user.id } }),
  };
  const handler = createPostHandler({
    strapi,
    authenticationStrategy: {
      authenticate: async (ctx) => {
        const userId = ctx.request.header.authorization?.replace(/^Bearer /, "");
        return ["alice", "bob"].includes(userId)
          ? { authenticated: true, user: { id: userId }, ability: { can: () => true } }
          : { authenticated: false, reason: "invalid_token" };
      },
    },
    config: { isDevMode: () => false, connectTimeoutMs: 5000, requestTimeoutMs: 5000 },
    capabilityDefinitions: { tools: new Map([[definition.name, definition]]), prompts: new Map(), resources: new Map() },
    createServerWithRegistries: (options) => {
      const result = createMcpServerWithRegistries(options);
      assert.ok(!created.has(result.mcpServer));
      created.add(result.mcpServer);
      return result;
    },
  });
  const server = http.createServer(async (req, res) => {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      await handler({ req, res, state: {}, request: { header: req.headers, body: JSON.parse(Buffer.concat(chunks).toString()) } });
    } catch (error) {
      errors.push(error);
      res.writeHead(500).end();
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  const request = async (user, body) => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${user}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...body }),
      signal: AbortSignal.timeout(5000),
    });
    return { status: response.status, body: parseRpc(await response.text()) };
  };
  const initialize = { method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "dependency-regression", version: "1.0.0" } } };
  for (const user of ["alice", "bob", "alice"]) {
    const result = await request(user, initialize);
    assert.equal(result.status, 200);
    assert.equal(result.body.result.serverInfo.name, "strapi-mcp-server");
  }
  const results = await Promise.all(["alice", "bob", "alice", "bob"].map(async (user) => {
    const result = await request(user, { method: "tools/call", params: { name: definition.name, arguments: {} } });
    assert.equal(result.status, 200);
    assert.deepEqual(result.body.result.structuredContent, { userId: user });
    return result;
  }));
  assert.equal(results.length, 4);
  const rejected = await request("invalid", initialize);
  assert.equal(rejected.status, 401);
  assert.ok(rejected.body.error);
  assert.equal(created.size, 7, "unauthenticated calls must not create an MCP server");
  assert.deepEqual(errors, []);
});
