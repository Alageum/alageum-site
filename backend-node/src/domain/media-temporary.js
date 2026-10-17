"use strict";
const { AsyncLocalStorage } = require("node:async_hooks");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { finished } = require("node:stream/promises");
const context = new AsyncLocalStorage();
function onFileBegin(_field, file) {
  const active = context.getStore();
  if (!active) throw new Error("Private media temporary-file admission is missing");
  file.filepath = path.join(active.directory, randomUUID());
  active.files.add(file);
}
async function closeFiles(files) {
  await Promise.all([...files].map(async file => {
    const stream = file._writeStream;
    if (!stream || stream.closed) return;
    const closed = finished(stream).catch(() => undefined);
    if (!stream.writableFinished) stream.destroy();
    await closed;
  }));
}
module.exports = { context, onFileBegin, closeFiles };
