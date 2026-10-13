"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");

test("scoped Nodemailer override preserves Strapi provider API and attachment restrictions without delivery", async () => {
  const nodemailer = require("nodemailer");
  const original = nodemailer.createTransport;
  const sent = [];
  let closes = 0;
  nodemailer.createTransport = (options) => {
    assert.equal(options.host, "127.0.0.1");
    const memory = original({ streamTransport: true, buffer: true });
    return {
      async sendMail(mail) {
        assert.equal(mail.disableFileAccess, true);
        assert.equal(mail.disableUrlAccess, true);
        const result = await memory.sendMail(mail);
        sent.push(result);
        return result;
      },
      close() { ++closes; memory.close(); },
    };
  };
  try {
    const provider = require("@strapi/provider-email-sendmail").init(
      { devPort: 2525, devHost: "127.0.0.1", silent: true },
      { defaultFrom: "sender@example.invalid", defaultReplyTo: "reply@example.invalid" },
    );
    await provider.send({ to: "buyer@example.invalid", subject: "Local compatibility test", text: "In-memory message", html: "<p>In-memory message</p>" });
    assert.deepEqual(sent[0].envelope, { from: "sender@example.invalid", to: ["buyer@example.invalid"] });
    assert.match(sent[0].message.toString(), /Reply-To: reply@example.invalid/);
    for (const attachment of [
      { filename: "blocked.txt", path: "/never-read-security-test" },
      { filename: "blocked.txt", href: "https://example.invalid/never-fetch" },
    ]) {
      await assert.rejects(provider.send({ to: "buyer@example.invalid", subject: "Blocked content", text: "Blocked", attachments: [attachment] }), /Failed to deliver/);
    }
    assert.equal(sent.length, 1);
    assert.ok(closes > 0);
  } finally {
    nodemailer.createTransport = original;
  }
});
