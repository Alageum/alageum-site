"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const Handlebars = require("handlebars");

test("reviewed Handlebars patch preserves string templates and HTML escaping", () => {
  assert.equal(Handlebars.VERSION, "4.7.10");
  assert.equal(Handlebars.compile("Hello {{name}}")({ name: "<Client>" }), "Hello &lt;Client&gt;");
  const template = "{{#each items}}{{@index}}:{{name}};{{/each}}";
  assert.equal(Handlebars.compile(template)({ items: [{ name: "A" }, { name: "B" }] }), "0:A;1:B;");
});

test("precompiled templates escape HTML script terminators", () => {
  const output = Handlebars.precompile("safe</script><script>text</script>");
  assert.equal(output.toLowerCase().includes("</script>"), false);
});

test("compiler rejects malformed AST block parameter lengths before rendering", () => {
  const ast = Handlebars.parse("{{#missingHelper}}{{/missingHelper}}");
  // A harmless non-numeric value exercises the type-confusion boundary without
  // executing an exploit or exposing any process information.
  ast.body[0].program.blockParams = { length: "invalid" };
  assert.throws(() => Handlebars.compile(ast)());
});
