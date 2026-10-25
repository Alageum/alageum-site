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
function multipartFileOrder(files) {
  const active = context.getStore();
  if (!active) return files;
  // Formidable emits file only after each independent write completes. Its
  // result array is completion order, whereas fileBegin records wire order.
  // Match server-owned paths because MIME validation may clone file objects.
  const positions = new Map([...active.files].map((file, index) => [file.filepath, index]));
  if (files.some(file => !positions.has(file.filepath))) throw new Error("Unowned multipart file");
  return [...files].sort((a, b) => positions.get(a.filepath) - positions.get(b.filepath));
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
module.exports = { context, onFileBegin, closeFiles, multipartFileOrder };
