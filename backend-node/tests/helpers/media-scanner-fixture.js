"use strict";
const net = require("node:net");
const { Duplex } = require("node:stream");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { readMediaConfig } = require("../../src/domain/media-policy");
// This is a deterministic protocol test double, NOT a malware engine. Never
// imported by production code. The harmless standard EICAR string is test data.
const EICAR = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
async function scannerFixture(t, responder, { inMemory = false } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "alageum-scanner-test-"));
  const config = readMediaConfig((name, fallback) => ({
    ALAGEUM_MEDIA_QUARANTINE_DIR: path.join(root, "quarantine"),
    ALAGEUM_MEDIA_CLAMAV_HOST: "127.0.0.1",
    ALAGEUM_MEDIA_SCAN_TIMEOUT_MS: "2000",
  })[name] ?? fallback);
  const sockets = new Set(), scanned = [];
  let answer = responder || (bytes => bytes.includes(EICAR) ? "stream: Eicar-Test-Signature FOUND\0" : "stream: OK\0");
  function receive(socket) {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
    let pending = Buffer.alloc(0), command = false, chunks = [];
    return data => {
      pending = Buffer.concat([pending, data]);
      if (!command) {
        if (pending.length < 10) return;
        if (!pending.subarray(0, 10).equals(Buffer.from("zINSTREAM\0"))) return socket.destroy();
        pending = pending.subarray(10); command = true;
      }
      while (pending.length >= 4) {
        const length = pending.readUInt32BE(0);
        if (pending.length < length + 4) break;
        const bytes = pending.subarray(4, 4 + length); pending = pending.subarray(4 + length);
        if (!length) {
          const input = Buffer.concat(chunks); scanned.push(input);
          const response = answer(input, scanned.length, socket);
          if (response != null) queueMicrotask(() => inMemory ? socket.push(Buffer.from(response)) : socket.end(response));
          return;
        }
        chunks.push(bytes);
      }
    };
  }
  let server;
  if (inMemory) {
    // Same byte-framed client code, in-memory transport; usable in restricted CI.
    // This does not prove operating-system socket connectivity or daemon behavior.
    t.mock.method(net, "createConnection", options => {
      let consume;
      const socket = new Duplex({ read() {}, write(chunk, _encoding, callback) { consume(chunk); callback(); } });
      consume = receive(socket);
      queueMicrotask(() => !options.path && options.host === config.scanner.host && options.port === config.scanner.port ? socket.emit("connect") : socket.destroy(new Error("unreachable fixture")));
      return socket;
    });
  } else {
    server = net.createServer(socket => socket.on("data", receive(socket)));
    await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  }
  if (server) config.scanner.port = server.address().port;
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    if (server) await new Promise(resolve => server.close(resolve));
    await fs.rm(root, { recursive: true, force: true });
  });
  return { config, root, scanned, setResponder: responder => { answer = responder; }, server };
}
module.exports = { scannerFixture, EICAR };
