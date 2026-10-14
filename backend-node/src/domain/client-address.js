"use strict";
const { isIP } = require("node:net");
const { AppError } = require("./errors");
const resolved = new WeakMap();
function normalizeAddress(value) {
  if (typeof value !== "string") return null;
  const version = isIP(value);
  if (version === 4) return value;
  if (version !== 6 || value.includes("%")) return null;
  const address = new URL(`http://[${value}]/`).hostname.slice(1, -1).toLowerCase();
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(address);
  if (!mapped) return address;
  const high = parseInt(mapped[1], 16), low = parseInt(mapped[2], 16);
  return [high >> 8, high & 255, low >> 8, low & 255].join(".");
}
function trustedProxyAddresses(values = []) {
  if (!Array.isArray(values) || values.length > 32) throw new Error("Trusted proxies must be an explicit bounded IP list");
  return [...new Set(values.map(value => {
    const address = normalizeAddress(value);
    if (!address || ["0.0.0.0", "::"].includes(address)) throw new Error("Trusted proxies require individual IP addresses, never wildcard trust");
    return address;
  }))];
}
function socketAddress(ctx) {
  return normalizeAddress(ctx.req?.socket?.remoteAddress || ctx.request?.socket?.remoteAddress) || "unknown";
}
function clientAddress(ctx) { return resolved.get(ctx)?.address || socketAddress(ctx); }
function applyRequestSecurity(ctx, trusted = []) {
  const peer = socketAddress(ctx), allowed = new Set(trustedProxyAddresses(trusted));
  let address = peer;
  // Koa proxy trust stays off. Forwarding headers matter only from explicitly
  // configured immediate peers; untrusted left-hand XFF entries are ignored.
  if (allowed.has(peer)) {
    const get = name => ctx.get?.(name) || ctx.headers?.[name.toLowerCase()] || "";
    const raw = get("X-Forwarded-For"), protocol = get("X-Forwarded-Proto");
    if (typeof raw !== "string" || raw.length > 2048 || typeof protocol !== "string" || (protocol && !["http", "https"].includes(protocol))) {
      throw new AppError("invalid_proxy_headers", "Invalid trusted-proxy headers", 400);
    }
    if (raw) {
      const chain = raw.split(",").map(part => normalizeAddress(part.trim()));
      if (chain.length > 16 || chain.some(part => !part)) throw new AppError("invalid_proxy_headers", "Invalid trusted-proxy headers", 400);
      for (let index = chain.length - 1; index >= 0; index--) {
        address = chain[index];
        if (!allowed.has(address)) break;
      }
    }
    // Secure cookies work behind a reviewed TLS terminator without globally
    // trusting Koa's forwarded host/IP/protocol getters.
    if (protocol && ctx.request) Object.defineProperty(ctx.request, "protocol", { configurable: true, get: () => protocol });
  }
  resolved.set(ctx, { address });
  return address;
}
module.exports = { normalizeAddress, trustedProxyAddresses, clientAddress, applyRequestSecurity };
