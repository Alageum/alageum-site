"use strict";
const net = require("node:net");
const { MediaAdmissionError } = require("./media-policy");
// ClamAV clamd INSTREAM: no shell, URL fetch, file-path transmission or public service.
function scanBytes(bytes, config) {
  if (!config?.socketPath && !config?.host)
    return Promise.reject(new MediaAdmissionError("media_scanner_unavailable", "Media uploads are unavailable until the malware scanner is configured", 503));
  return new Promise((resolve, reject) => {
    let settled = false, sent = false, reply = Buffer.alloc(0);
    const socket = net.createConnection(config.socketPath ? { path: config.socketPath } : { host: config.host, port: config.port });
    const finish = error => {
      if (settled) return; settled = true; clearTimeout(timer); socket.destroy();
      error ? reject(error) : resolve();
    };
    const unavailable = () => new MediaAdmissionError("media_scanner_unavailable", "Media malware scanner is unavailable; upload was refused", 503);
    const timer = setTimeout(() => finish(new MediaAdmissionError("media_scan_timeout", "Media malware scan timed out; upload was refused", 503)), config.timeoutMs);
    socket.on("error", () => finish(unavailable()));
    socket.on("end", () => { if (!settled) finish(unavailable()); });
    socket.on("close", () => { if (!settled) finish(unavailable()); });
    socket.on("data", chunk => {
      reply = Buffer.concat([reply, chunk]);
      if (reply.length > 4096) return finish(unavailable());
      const end = reply.indexOf(0);
      if (end < 0) return;
      const result = reply.subarray(0, end).toString("utf8");
      if (!sent || end !== reply.length - 1) return finish(unavailable());
      if (result === "stream: OK") return finish();
      if (/^stream: .+ FOUND$/.test(result))
        return finish(new MediaAdmissionError("media_malware_detected", "Media file was rejected by malware screening", 400));
      finish(unavailable());
    });
    socket.once("connect", () => {
      socket.write(Buffer.from("zINSTREAM\0"));
      // Bounded to 1 MiB by admission; 64 KiB frames respect common daemon limits.
      for (let offset = 0; offset < bytes.length; offset += 65536) {
        const chunk = bytes.subarray(offset, offset + 65536), size = Buffer.alloc(4);
        size.writeUInt32BE(chunk.length); socket.write(size); socket.write(chunk);
      }
      sent = true; socket.write(Buffer.alloc(4));
    });
  });
}
module.exports = { scanBytes };
