"use strict";
// Test-only, loopback-bound SMTP sink. It never relays or contacts another host.
const net = require("node:net");
const tls = require("node:tls");
async function startSmtpCapture({ key, cert, port = 2525, rejectMessages = () => false, advertiseStartTls = true }) {
  const messages = [], sockets = new Set(), connections = [];
  let startTls = advertiseStartTls;
  const secureContext = tls.createSecureContext({ key, cert });
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket)); socket.on("error", () => {});
    const state = { secure: false, from: "", recipients: [], data: false, lines: [], auth: false };
    connections.push(state);
    function attach(stream) {
      let buffer = "";
      const write = line => stream.write(line + "\r\n");
      const onData = chunk => {
        buffer += chunk.toString("utf8");
        while (buffer.includes("\r\n")) {
          const index = buffer.indexOf("\r\n"), line = buffer.slice(0, index); buffer = buffer.slice(index + 2);
          if (state.data) {
            if (line === ".") {
              state.data = false;
              if (rejectMessages()) write("451 Synthetic temporary rejection");
              else { messages.push({ raw: state.lines.join("\r\n"), from: state.from, recipients: [...state.recipients], secure: state.secure }); write("250 Captured locally"); }
              state.lines = [];
            } else state.lines.push(line.startsWith("..") ? line.slice(1) : line);
            continue;
          }
          const verb = line.split(" ", 1)[0].toUpperCase();
          if (verb === "EHLO" || verb === "HELO") {
            write("250-localhost test-only SMTP capture");
            if (!state.secure && startTls) write("250-STARTTLS");
            if (state.secure) write("250-AUTH PLAIN");
            write("250 SIZE 1048576");
          } else if (verb === "STARTTLS" && !state.secure && startTls) {
            write("220 Ready for TLS"); stream.removeListener("data", onData);
            const secure = new tls.TLSSocket(stream, { isServer: true, secureContext });
            sockets.add(secure); secure.on("close", () => sockets.delete(secure)); secure.on("error", () => {});
            state.secure = true; attach(secure); return;
          } else if (verb === "AUTH" && state.secure) {
            const fields = Buffer.from(line.split(" ")[2] || "", "base64").toString("utf8").split("\0");
            state.auth = fields[1] === "synthetic-test-user" && fields[2] === "synthetic-test-password";
            write(state.auth ? "235 Synthetic authentication accepted" : "535 Synthetic authentication rejected");
          }
          else if (verb === "MAIL" && state.secure) {
            state.from = /FROM:\s*<([^>]+)>/i.exec(line)?.[1] || ""; state.recipients = [];
            write(state.from.endsWith(".test") ? "250 Sender accepted" : "550 Test addresses only");
          } else if (verb === "RCPT" && state.secure) {
            const address = /TO:\s*<([^>]+)>/i.exec(line)?.[1] || "";
            if (!address.endsWith(".test")) write("550 Test addresses only"); else { state.recipients.push(address); write("250 Recipient accepted"); }
          } else if (verb === "DATA" && state.secure && state.recipients.length) { state.data = true; write("354 End with dot"); }
          else if (verb === "QUIT") { write("221 Goodbye"); stream.end(); }
          else if (verb === "RSET") { state.from = ""; state.recipients = []; write("250 Reset"); }
          else if (verb === "NOOP") write("250 OK");
          else write("530 TLS is required");
        }
      };
      stream.on("data", onData);
    }
    attach(socket); socket.write("220 localhost test-only SMTP capture\r\n");
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", resolve); });
  return { port: server.address().port, messages, connections, setStartTls(value) { startTls = value; }, async close() { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); } };
}
function plainText(message) {
  const [headers, ...parts] = message.raw.split("\r\n\r\n"), body = parts.join("\r\n\r\n");
  if (/Content-Transfer-Encoding:\s*base64/i.test(headers)) return Buffer.from(body.replace(/\s/g, ""), "base64").toString("utf8");
  if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(headers)) {
    const unfolded = body.replace(/=\r\n/g, ""), bytes = [];
    for (let i = 0; i < unfolded.length; i++) {
      if (unfolded[i] === "=" && /^[0-9a-f]{2}$/i.test(unfolded.slice(i + 1, i + 3))) { bytes.push(parseInt(unfolded.slice(i + 1, i + 3), 16)); i += 2; }
      else bytes.push(unfolded.charCodeAt(i));
    }
    return Buffer.from(bytes).toString("utf8");
  }
  return body;
}
module.exports = { startSmtpCapture, plainText };
