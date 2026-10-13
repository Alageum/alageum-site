"use strict";
const { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } = require("node:crypto");
const { AppError } = require("./errors");
const table = (db, name) => db.withSchema("b2b").table(name);
const keyFor = secret => createHash("sha256").update(`alageum-registration-outbox:${secret}`).digest();
function seal(payload, secret) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(x => x.toString("base64url")).join(".");
}
function unseal(value, secret) {
  const [iv, tag, data] = value.split(".").map(x => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
function createRegistrationMail({ config, transportFactory }) {
  const settings = config.registrationMail || {}, enabled = settings.provider === "smtp";
  let transport;
  function assertConfigured() {
    if (!enabled || !settings.host || !settings.from || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.from) || ![465, 587, 2525].includes(Number(settings.port)))
      throw new AppError("mail_unavailable", "Email verification is not configured. Contact the site administrator.", 503);
    if (!!settings.user !== !!settings.pass) throw new AppError("mail_unavailable", "Email verification is not configured. Contact the site administrator.", 503);
  }
  async function send(payload) {
    assertConfigured();
    if (!transport) {
      const factory = transportFactory || require("nodemailer").createTransport;
      transport = factory({ host: settings.host, port: Number(settings.port), secure: Number(settings.port) === 465,
        requireTLS: Number(settings.port) !== 465, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
        auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        disableFileAccess: true, disableUrlAccess: true });
    }
    const info = await transport.sendMail({ from: settings.from, to: payload.email,
      subject: payload.purpose === "verify" ? "Подтвердите email ALAGEUM" : "Смена пароля ALAGEUM",
      text: `${payload.purpose === "verify" ? "Подтвердите адрес электронной почты" : "Установите новый пароль"}:\n${payload.url}\n\nСсылка действует ${payload.purpose === "verify" ? "24 часа" : "30 минут"} и используется один раз. Если вы не отправляли запрос, проигнорируйте письмо.`,
      disableFileAccess: true, disableUrlAccess: true });
    if (!Array.isArray(info.accepted) || !info.accepted.length) throw new Error("Mail provider did not accept the message");
  }
  return { assertConfigured, send, enabled };
}
function createMailOutbox({ db, config, mail, audit, now = Date.now }) {
  if (typeof config.jwtSecret !== "string" || config.jwtSecret.length < 32) throw new TypeError("Outbox encryption secret is required");
  let timer, running;
  async function enqueue(tx, { tokenId, email, purpose, token, expiresAt }) {
    const url = new URL(purpose === "verify" ? "/verify-email" : "/reset-password", config.browserOrigin);
    // Fragments keep credentials out of web-server access logs and Referer headers.
    url.hash = new URLSearchParams({ token }).toString();
    await table(tx, "registration_mail_outbox").insert({ id: randomUUID(), token_id: tokenId, payload: seal({ email, purpose, url: url.toString() }, config.jwtSecret), expires_at: expiresAt });
  }
  async function processQueue() {
      // Remove expired ciphertext and spent buckets, never retain raw credentials.
      await table(db, "registration_mail_outbox").where("expires_at", "<=", new Date(now())).delete();
      await table(db, "registration_rate_buckets").where("expires_at", "<=", new Date(now())).delete();
      if (!mail.enabled) return;
      for (let index = 0; index < 20; index++) {
        const row = await db.transaction(async tx => {
          const job = await table(tx, "registration_mail_outbox").where("available_at", "<=", new Date(now())).where("expires_at", ">", new Date(now()))
            .where(q => q.whereNull("locked_until").orWhere("locked_until", "<", new Date(now())))
            .orderBy("created_at").forUpdate().skipLocked().first();
          if (!job) return null;
          await table(tx, "registration_mail_outbox").where({ id: job.id }).update({ locked_until: new Date(now() + 60000), attempts: job.attempts + 1 });
          return job;
        });
        if (!row) break;
        const token = await table(db, "account_tokens").where({ id: row.token_id }).whereNull("consumed_at").first();
        if (!token) { await table(db, "registration_mail_outbox").where({ id: row.id }).delete(); continue; }
        try {
          await mail.send(unseal(row.payload, config.jwtSecret));
          await db.transaction(async tx => {
            await table(tx, "registration_mail_outbox").where({ id: row.id }).delete();
            await audit(tx, null, { action: "account_mail_accepted", entity_type: "account_token", entity_id: row.token_id });
          });
        } catch {
          await db.transaction(async tx => {
            if (row.attempts >= 4) await table(tx, "registration_mail_outbox").where({ id: row.id }).delete();
            else await table(tx, "registration_mail_outbox").where({ id: row.id }).update({ locked_until: null, available_at: new Date(now() + 30000 * (2 ** row.attempts)) });
            // No email address, token, message body or provider error is logged.
            await audit(tx, null, { action: "account_mail_failed", entity_type: "account_token", entity_id: row.token_id });
          });
        }
      }
  }
  function flush() {
    if (!running) running = processQueue().finally(() => { running = null; });
    return running;
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { void flush().catch(() => {}); }, 15000);
    timer.unref?.();
    void flush().catch(() => {});
  }
  async function stop() { if (timer) clearInterval(timer); timer = null; if (running) await running; }
  return { enqueue, flush, start, stop };
}
module.exports = { createRegistrationMail, createMailOutbox, seal, unseal };
