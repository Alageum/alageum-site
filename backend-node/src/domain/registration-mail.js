"use strict";
const { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } = require("node:crypto");
const { isIP } = require("node:net");
const { AppError } = require("./errors");
const table = (db, name) => db.withSchema("b2b").table(name);
const keyFor = secret => createHash("sha256").update(`alageum-registration-outbox:${secret}`).digest();
const MAX_ATTEMPTS = 5, LEASE_MS = 60000, POLL_MS = 15000;
const mailbox = value => typeof value === "string" && value.length <= 320 && !/[\x00-\x1f\x7f]/.test(value) && /^[^\s@<>,;:"\\()[\]]+@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value);
const hostname = value => typeof value === "string" && value.length <= 253 && (isIP(value) || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(value));
function seal(payload, secret) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", keyFor(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(x => x.toString("base64url")).join(".");
}
function unseal(value, secret) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]+$/.test(value)) throw new Error("Invalid encrypted mail payload");
  const [iv, tag, data] = value.split(".").map(x => Buffer.from(x, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", keyFor(secret), iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8"));
}
function approvedOrigin(config) {
  try {
    const origin = new URL(config.browserOrigin);
    if (origin.origin !== config.browserOrigin || origin.username || origin.password) return false;
    return origin.protocol === "https:" || (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname) && ["development", "test"].includes(config.env));
  } catch { return false; }
}
// Safe diagnostic identifiers only: never return credentials or their values.
function inspectMailConfiguration(config) {
  const settings = config.registrationMail || {}, issues = [];
  const enabled = settings.provider === "smtp";
  if (!enabled) return { enabled: false, configured: false, issues: [!settings.provider || settings.provider === "disabled" ? "mail_disabled" : "unsupported_mail_provider"] };
  if (!hostname(settings.host)) issues.push("smtp_host");
  if (![465, 587, 2525].includes(Number(settings.port))) issues.push("smtp_port");
  if (!mailbox(settings.from)) issues.push("mail_from");
  if (settings.tlsServername && (!hostname(settings.tlsServername) || isIP(settings.tlsServername))) issues.push("smtp_tls_servername");
  if (!!settings.user !== !!settings.pass || (settings.user && (typeof settings.user !== "string" || /[\r\n]/.test(settings.user))) || (settings.pass && typeof settings.pass !== "string")) issues.push("smtp_credentials");
  if (!approvedOrigin(config)) issues.push("browser_origin");
  return { enabled, configured: !issues.length, issues };
}
function validPayload(payload, config) {
  if (!payload || !mailbox(payload.email) || !["verify", "reset"].includes(payload.purpose)) return false;
  try {
    const url = new URL(payload.url);
    return approvedOrigin(config) && url.origin === config.browserOrigin && !url.username && !url.password && !url.search &&
      url.pathname === (payload.purpose === "verify" ? "/verify-email" : "/reset-password") && /^#token=[A-Za-z0-9_-]{64}$/.test(url.hash);
  } catch { return false; }
}
function createRegistrationMail({ config, transportFactory }) {
  const settings = config.registrationMail || {}, enabled = settings.provider === "smtp";
  let transport;
  function assertConfigured() {
    if (!inspectMailConfiguration(config).configured) throw new AppError("mail_unavailable", "Email verification is not configured. Contact the site administrator.", 503);
  }
  function getTransport() {
    assertConfigured();
    if (!transport) {
      const factory = transportFactory || require("nodemailer").createTransport;
      transport = factory({ host: settings.host, port: Number(settings.port), secure: Number(settings.port) === 465,
        requireTLS: Number(settings.port) !== 465, tls: { minVersion: "TLSv1.2", rejectUnauthorized: true, ...(settings.tlsServername ? { servername: settings.tlsServername } : {}) },
        auth: settings.user ? { user: settings.user, pass: settings.pass } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
        disableFileAccess: true, disableUrlAccess: true, logger: false, debug: false });
    }
    return transport;
  }
  async function verifyConnection() { return getTransport().verify(); }
  async function send(payload, { messageId } = {}) {
    assertConfigured();
    if (!validPayload(payload, config)) { const error = new Error("Invalid account mail payload"); error.code = "INVALID_MAIL_PAYLOAD"; throw error; }
    const info = await getTransport().sendMail({ from: { address: settings.from }, to: { address: payload.email },
      ...(messageId ? { messageId } : {}),
      subject: payload.purpose === "verify" ? "Подтвердите email ALAGEUM" : "Смена пароля ALAGEUM",
      text: `${payload.purpose === "verify" ? "Подтвердите адрес электронной почты" : "Установите новый пароль"}:\n${payload.url}\n\nСсылка действует ${payload.purpose === "verify" ? "24 часа" : "30 минут"} и используется один раз. Если вы не отправляли запрос, проигнорируйте письмо.`,
      disableFileAccess: true, disableUrlAccess: true });
    if (!Array.isArray(info.accepted) || !info.accepted.length) { const error = new Error("Mail provider did not accept the message"); error.code = "MAIL_NOT_ACCEPTED"; throw error; }
  }
  return { assertConfigured, verifyConnection, send, enabled, diagnostics: () => inspectMailConfiguration(config) };
}
function failureCode(error) {
  if (error?.code === "INVALID_MAIL_PAYLOAD") return "payload_invalid";
  if (error?.code === "EAUTH") return "smtp_authentication";
  if (error?.code === "ETIMEDOUT") return "smtp_timeout";
  if (error?.code === "ESOCKET" || error?.code === "ECONNECTION") return "smtp_connection";
  if (error?.code === "MAIL_NOT_ACCEPTED" || Number(error?.responseCode) >= 500) return "smtp_rejected";
  return "smtp_failure";
}
function createMailOutbox({ db, config, mail, audit, now = Date.now }) {
  if (typeof config.jwtSecret !== "string" || config.jwtSecret.length < 32) throw new TypeError("Outbox encryption secret is required");
  let timer, running, lastRunAt = null, lastSuccessAt = null, lastErrorAt = null;
  async function enqueue(tx, { tokenId, email, purpose, token, expiresAt }) {
    const url = new URL(purpose === "verify" ? "/verify-email" : "/reset-password", config.browserOrigin);
    url.hash = new URLSearchParams({ token }).toString();
    const payload = { email, purpose, url: url.toString() };
    if (!validPayload(payload, config)) throw new AppError("validation_error", "A valid email and account link are required", 422);
    await table(tx, "registration_mail_outbox").insert({ id: randomUUID(), token_id: tokenId, payload: seal(payload, config.jwtSecret), expires_at: expiresAt });
  }
  const owned = (tx, row) => table(tx, "registration_mail_outbox").where({ id: row.id, lease_id: row.lease_id });
  async function settle(row, action, error) {
    return db.transaction(async tx => {
      const terminal = action === "account_mail_accepted" || row.attempts >= MAX_ATTEMPTS || error?.code === "INVALID_MAIL_PAYLOAD";
      const changed = terminal ? await owned(tx, row).delete() : await owned(tx, row).update({ lease_id: null, locked_until: null, available_at: new Date(now() + 30000 * (2 ** (row.attempts - 1))) });
      if (changed) await audit(tx, null, { action, entity_type: "account_token", entity_id: row.token_id,
        event_metadata: { attempt: row.attempts, terminal, ...(error ? { failure: failureCode(error) } : {}) } });
      return changed;
    });
  }
  async function processQueue() {
    await table(db, "registration_mail_outbox").where("expires_at", "<=", new Date(now())).delete();
    await table(db, "registration_rate_buckets").where("expires_at", "<=", new Date(now())).delete();
    if (!mail.enabled || (mail.diagnostics && !mail.diagnostics().configured)) return;
    for (let index = 0; index < 20; index++) {
      const row = await db.transaction(async tx => {
        const job = await table(tx, "registration_mail_outbox").where("available_at", "<=", new Date(now())).where("expires_at", ">", new Date(now()))
          .where(q => q.whereNull("locked_until").orWhere("locked_until", "<=", new Date(now())))
          .orderBy("created_at").orderBy("id").forUpdate().skipLocked().first();
        if (!job) return null;
        if (job.attempts >= MAX_ATTEMPTS) {
          await table(tx, "registration_mail_outbox").where({ id: job.id }).delete();
          await audit(tx, null, { action: "account_mail_failed", entity_type: "account_token", entity_id: job.token_id, event_metadata: { attempt: job.attempts, terminal: true, failure: "attempts_exhausted" } });
          return { exhausted: true };
        }
        const claim = { lease_id: randomUUID(), locked_until: new Date(now() + LEASE_MS), attempts: job.attempts + 1 };
        await table(tx, "registration_mail_outbox").where({ id: job.id }).update(claim);
        return { ...job, ...claim };
      });
      if (!row) break;
      if (row.exhausted) continue;
      const token = await table(db, "account_tokens").where({ id: row.token_id }).whereNull("consumed_at").where("expires_at", ">", new Date(now())).first();
      if (!token) { await owned(db, row).delete(); continue; }
      let renewal = Promise.resolve();
      // A live worker renews its claim during a slow SMTP dialogue. A crashed
      // worker stops renewing, allowing another process to recover the row.
      const heartbeat = setInterval(() => {
        renewal = renewal.then(() => owned(db, row).update({ locked_until: new Date(now() + LEASE_MS) })).catch(() => {});
      }, LEASE_MS / 3);
      heartbeat.unref?.();
      try {
        let payload;
        try { payload = unseal(row.payload, config.jwtSecret); } catch { const error = new Error("Invalid encrypted mail payload"); error.code = "INVALID_MAIL_PAYLOAD"; throw error; }
        await mail.send(payload, { messageId: `<account-${row.id}@alageum.invalid>` });
        await settle(row, "account_mail_accepted");
      } catch (error) { await settle(row, "account_mail_failed", error); }
      finally { clearInterval(heartbeat); await renewal; }
    }
  }
  function flush() {
    if (!running) {
      lastRunAt = new Date(now()).toISOString();
      running = processQueue().then(() => { lastSuccessAt = new Date(now()).toISOString(); lastErrorAt = null; })
        .catch(error => { lastErrorAt = new Date(now()).toISOString(); throw error; }).finally(() => { running = null; });
    }
    return running;
  }
  function status() {
    return { mail_enabled: mail.enabled === true, configuration: mail.diagnostics ? mail.diagnostics() : { configured: mail.enabled === true },
      polling: Boolean(timer), running: Boolean(running), last_run_at: lastRunAt, last_success_at: lastSuccessAt,
      last_error_at: lastErrorAt, last_error: lastErrorAt ? "outbox_unavailable" : null };
  }
  function start() {
    if (timer) return;
    timer = setInterval(() => { void flush().catch(() => {}); }, POLL_MS);
    timer.unref?.();
    void flush().catch(() => {});
  }
  async function stop() { if (timer) clearInterval(timer); timer = null; if (running) await running; }
  return { enqueue, flush, start, stop, status };
}
module.exports = { createRegistrationMail, createMailOutbox, inspectMailConfiguration, validPayload, mailbox, seal, unseal, MAX_ATTEMPTS, LEASE_MS };
