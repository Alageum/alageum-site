"use strict";

const { version: packageVersion } = require("../../package.json");

function jsonInteger(value) {
  return value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : JSON.rawJSON(value.toString());
}

// Python round(binary64, 6) rounds the exact binary value, with ties to even.
// Multiplying a Number by 1e6 before rounding can erase which side of a tie
// it was on. Work with the binary significand instead, then parse the rounded
// decimal once to avoid a second intermediate floating-point rounding.
function roundSix(value) {
  if (value === 0) return 0;
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value);
  const bits = view.getBigUint64(0);
  const exponent = Number((bits >> 52n) & 0x7ffn);
  const significand = (bits & ((1n << 52n) - 1n)) | (exponent ? 1n << 52n : 0n);
  const shift = (exponent || 1) - 1023 - 52;
  let units = significand * 1000000n;
  if (shift >= 0) units <<= BigInt(shift);
  else {
    const denominator = 1n << BigInt(-shift);
    const remainder = units % denominator;
    units /= denominator;
    if (remainder * 2n > denominator || (remainder * 2n === denominator && units % 2n)) units++;
  }
  const digits = units.toString().padStart(7, "0");
  return Number(`${digits.slice(0, -6)}.${digits.slice(-6)}`);
}

function createMetrics() {
  let requests = 0n, errors = 0n, samples = 0n, duration = 0;
  return Object.freeze({
    recordHttp(status, durationSeconds) {
      requests++;
      if (typeof status === "number" && Number.isFinite(status) && status >= 400) errors++;
      // A bad clock reading must not turn a public metric into NaN/Infinity or
      // invent a zero-duration sample. Omit overflowing sums for the same reason.
      if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds >= 0 && Number.isFinite(duration + durationSeconds)) {
        duration += durationSeconds;
        samples++;
      }
    },
    snapshot() {
      const values = {};
      // Insertion order matches the legacy endpoint's sorted JSON keys.
      if (errors) values.http_errors_total = jsonInteger(errors);
      if (samples) {
        values.http_request_duration_seconds_count = jsonInteger(samples);
        values.http_request_duration_seconds_sum = roundSix(duration);
      }
      if (requests) values.http_requests_total = jsonInteger(requests);
      return values;
    },
  });
}

function formatTimestamp(date) {
  // Date has millisecond precision. The extra zeros preserve the frozen
  // Pydantic text shape without claiming to measure sub-millisecond time.
  return date.toISOString().replace(/\.(\d{3})Z$/, (_, milliseconds) => milliseconds === "000" ? "Z" : `.${milliseconds}000Z`);
}

function createSystem({ db, metrics, environment, now = () => new Date() }) {
  if (!["test", "development"].includes(environment)) throw new Error("System reads require a guarded test/development application environment");
  // Deliberately public constants, captured once. Never serialize configuration
  // or allow APP_NAME/APP_VERSION/NODE_ENV to supply these fields.
  const version = Object.freeze({ name: "ALAGEUM API", version: packageVersion, environment });
  return Object.freeze({
    health(ctx) {
      ctx.status = 200;
      ctx.body = { status: "ok", timestamp: formatTimestamp(now()) };
    },
    async readiness(ctx) {
      await db.raw("SELECT 1");
      ctx.status = 200;
      ctx.body = { status: "ok", timestamp: formatTimestamp(now()), database: "ok" };
    },
    metrics(ctx) {
      ctx.status = 200;
      ctx.body = metrics.snapshot();
    },
    version(ctx) {
      ctx.status = 200;
      ctx.body = version;
    },
  });
}

module.exports = { createMetrics, formatTimestamp, createSystem, jsonInteger };
