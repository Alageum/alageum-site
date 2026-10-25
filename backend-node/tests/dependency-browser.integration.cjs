"use strict";

// Run after npm ci in backend-node and frontend. Reuses the repository's pinned
// Playwright without adding a browser dependency to the production backend.
const assert = require("node:assert/strict");
const path = require("node:path");
const { test } = require("node:test");
const { createRequire } = require("node:module");
const { build } = require("esbuild");
const fromFrontend = createRequire(path.resolve(__dirname, "../../frontend/package.json"));
const { chromium } = fromFrontend("playwright");
const managerRoot = path.dirname(require.resolve("@strapi/content-manager/package.json"));
const editorRoot = path.join(managerRoot, "dist/admin/pages/EditView/components/FormInputs/Wysiwyg/utils");

test("real Chromium verifies patched DOMPurify and the unchanged native Strapi rich-text renderer", { timeout: 60000 }, async (t) => {
  const bundled = await build({
    stdin: {
      contents: `window.dependencyProof = { sanitize: require(${JSON.stringify(path.join(editorRoot, "sanitizer.js"))}).sanitize, md: require(${JSON.stringify(path.join(editorRoot, "mdRenderer.js"))}).md, createDOMPurify: require("dompurify") };`,
      resolveDir: path.resolve(__dirname, ".."),
    },
    bundle: true,
    write: false,
    platform: "browser",
    format: "iife",
    // CSS is unrelated to this parser/sanitizer check; no package bytes change.
    loader: { ".css": "empty" },
  });
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {}),
    args: ["--no-sandbox"],
  });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.route("**/*", (route) => route.abort());
  await page.setContent("<!doctype html><html><body></body></html>");
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const { sanitize, md, createDOMPurify } = window.dependencyProof;
    const nativeHtml = sanitize(md.render("# Catalogue\n\n**Transformer** [Details](/catalog) ![Unit](/uploads/unit.png)\n\n==Rated== H~2~O\n\n```text\n<safe>\n```\n"));
    const hostileHtml = sanitize('<script>window.unexpected = true</script><img src="data:image/png;base64,AA==" onerror="window.unexpected = true"><a href="javascript:alert(1)">bad</a><iframe src="https://example.invalid"></iframe><p data-secret="test" onclick="alert(1)">safe</p>');
    const templateResults = [];
    for (const fragments of [["$", "{7*7}"], ["{", "{7*7}", "}"]]) {
      const purifier = createDOMPurify(window);
      const host = document.createElement("div");
      const shadow = host.attachShadow({ mode: "open" });
      for (const fragment of fragments) {
        shadow.append(document.createTextNode(fragment), document.createElement("object"));
      }
      purifier.sanitize(host, { IN_PLACE: true, SAFE_FOR_TEMPLATES: true });
      templateResults.push(shadow.textContent);
    }
    const detachedResults = [];
    for (const mode of ["parent", "sibling"]) {
      const purifier = createDOMPurify(window);
      const root = document.createElement("div");
      root.innerHTML = '<figure><img class="remove"><img onerror="window.unexpected = true"></figure>';
      const target = root.querySelector("img[onerror]");
      purifier.addHook("afterSanitizeAttributes", (node) => {
        if (node.getAttribute?.("class") === "remove") {
          if (mode === "parent") node.parentNode.remove();
          else node.nextElementSibling.remove();
        }
      });
      purifier.sanitize(root, { IN_PLACE: true });
      detachedResults.push(target.getAttribute("onerror"));
    }
    const xhtml = createDOMPurify(window).sanitize('<svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.invalid"><animate attributeName="href" values="x;javascript:alert(1)" /></a></svg>', {
      PARSER_MEDIA_TYPE: "application/xhtml+xml",
      ADD_TAGS: ["animate"],
      ADD_ATTR: ["attributeName", "values"],
    });
    return { version: createDOMPurify.version, nativeHtml, hostileHtml, templateResults, detachedResults, xhtml, executed: window.unexpected === true };
  });
  assert.equal(result.version, "3.4.17");
  for (const expected of ["<h1>Catalogue</h1>", "<strong>Transformer</strong>", 'href="/catalog"', 'src="/uploads/unit.png"', "<mark>Rated</mark>", "<sub>2</sub>", "&lt;safe&gt;", 'class="hljs"']) {
    assert.ok(result.nativeHtml.includes(expected), expected);
  }
  assert.ok(!/script|onerror|onclick|javascript:|data:|iframe|data-secret/i.test(result.hostileHtml));
  assert.ok(result.hostileHtml.includes("safe"));
  for (const text of result.templateResults) assert.ok(!/\$\{|\{\{/.test(text), text);
  assert.deepEqual(result.detachedResults, [null, null]);
  assert.ok(!/attributeName/i.test(result.xhtml), result.xhtml);
  assert.equal(result.executed, false);
  console.log("Verified native renderer/URL policy plus shadow-template, detached-hook and XHTML SMIL regressions in Chromium");
});
