"use strict";
const fs = require("node:fs/promises");
const path = require("node:path");
const { createRequire } = require("node:module");
const { Readable } = require("node:stream");
const { AsyncLocalStorage } = require("node:async_hooks");
const { randomUUID } = require("node:crypto");
const { fail, boundedBytes, fileType, safeName, providerIdentity } = require("./media-policy");
const { scanBytes } = require("./media-scanner");
const { secureMediaCreationMask } = require("./media-storage");
const { privateDirectory, readFileBounded, streamBytes } = require("./media-quarantine");
// Reuse the exact reviewed/pinned sharp instance used by Strapi, not a second decoder.
const sharp = createRequire(require.resolve("@strapi/upload/package.json"))("sharp");
const operations = new AsyncLocalStorage();

async function admitRaster(bytes, name, mime, config) {
  boundedBytes(bytes, config);
  const type = fileType(name, mime, bytes);
  // Scan untrusted input before any decoder/optimizer handles it.
  await scanBytes(bytes, config.scanner);
  try {
    const image = sharp(bytes, { limitInputPixels: config.maxPixels, failOn: "warning", animated: false });
    const metadata = await image.metadata();
    if (metadata.format !== type.format || !metadata.width || !metadata.height ||
        metadata.width * metadata.height > config.maxPixels || (metadata.pages || 1) !== 1)
      fail("media_invalid_image", "Media image is invalid, animated or exceeds the pixel limit");
    // Full decode and re-encode strips metadata, embedded profiles and trailing polyglots.
    // Auto-orient before removing EXIF; SVG/HTML never reach this decoder.
    const { data, info } = await image.rotate().toFormat(type.format).toBuffer({ resolveWithObject: true });
    boundedBytes(data, config); fileType(name, type.mime, data);
    await scanBytes(data, config.scanner);
    return { bytes: data, mime: type.mime, ext: type.ext, width: info.width, height: info.height };
  } catch (error) {
    if (error.name === "MediaAdmissionError") throw error;
    fail("media_invalid_image", "Media image could not be safely decoded");
  }
}
function createMediaAdmission({ config, publicRoot }) {
  async function withInputs(files, data, work) {
    const list = Array.isArray(files) ? files : [files];
    if (!list.length || list.length > config.maxFiles || list.some(file => !file))
      fail("media_file_count", "Upload between 1 and 10 media files");
    if (data?.path) fail("media_invalid_path", "Custom media storage paths are not allowed");
    const infos = Array.isArray(data?.fileInfo) ? data.fileInfo : [data?.fileInfo];
    // Validate names/types for every input before allocating quarantine or scanning.
    for (const [index, file] of list.entries()) {
      safeName(file.originalFilename);
      if (infos[index]?.name !== undefined) safeName(infos[index].name);
    }
    const directory = await privateDirectory(config, publicRoot);
    const pending = new Set();
    try {
      const admitted = [];
      for (const file of list) {
        const bytes = await readFileBounded(file.filepath, config);
        const safe = await admitRaster(bytes, file.originalFilename, file.mimetype, config);
        const filepath = path.join(directory, `${randomUUID()}${safe.ext}`);
        await fs.writeFile(filepath, safe.bytes, { flag: "wx", mode: 0o600 });
        admitted.push({ ...file, filepath, size: safe.bytes.length, mimetype: safe.mime,
          detectedMimeType: safe.mime, originalFilename: file.originalFilename.slice(0, -path.extname(file.originalFilename).length) + safe.ext });
      }
      return await operations.run(pending, () => work(admitted));
    } finally {
      // Native upload uses Promise.all for variants. Drain started provider operations
      // even if one fails so a rejected request cannot race quarantine cleanup.
      while (pending.size) await Promise.allSettled([...pending]);
      await fs.rm(directory, { recursive: true, force: true });
    }
  }
  function wrapProvider(provider) {
    for (const method of ["upload", "uploadStream", "replace", "replaceStream"]) {
      if (typeof provider[method] !== "function") continue;
      const original = provider[method];
      if (method.startsWith("replace")) {
        provider[method] = async file => {
          file?.stream?.destroy?.();
          fail("media_replace_disabled", "Binary media replacement is unavailable. Upload a new image instead; existing media is unchanged.", 409);
        };
        continue;
      }
      provider[method] = function (file, oldFileOrOptions) {
        const task = (async () => {
          try {
            providerIdentity(file);
            if (!secureMediaCreationMask()) fail("media_storage_umask_unsafe", "Media storage permissions are unsafe; upload was refused", 503);
            const bytes = method.endsWith("Stream") ? await streamBytes(file.stream, config) : file.buffer;
            // This gate covers originals, all thumbnails/responsive variants, and
            // direct low-level provider calls, before any public write.
            const safe = await admitRaster(bytes, `${file.hash}${file.ext}`, file.mime, config);
            file.sizeInBytes = safe.bytes.length; file.size = safe.bytes.length / 1000;
            file.mime = safe.mime; file.width = safe.width; file.height = safe.height;
            const delivered = { ...file, buffer: safe.bytes, stream: Readable.from(safe.bytes) };
            try { await original.call(provider, delivered, oldFileOrOptions); }
            finally { delivered.stream.destroy(); }
            // Native providers mutate URL/provider metadata on the argument.
            for (const key of ["url", "provider_metadata", "previewUrl"]) {
              if (Object.hasOwn(delivered, key)) file[key] = delivered[key];
            }
          } finally { file?.stream?.destroy?.(); }
        })();
        const pending = operations.getStore();
        if (pending) { pending.add(task); task.then(() => pending.delete(task), () => pending.delete(task)); }
        return task;
      };
    }
    return provider;
  }
  function wrapUpload(service) {
    const upload = service.upload;
    service.upload = async function ({ data = {}, files }, opts) {
      return withInputs(files, data, async admitted => {
        const infos = Array.isArray(data.fileInfo) ? data.fileInfo : [data.fileInfo];
        const results = [];
        // Admission is all-or-nothing for input files; persistence is serial to
        // avoid native fail-fast multipart siblings outliving request cleanup.
        for (const [index, file] of admitted.entries()) {
          results.push(...await upload.call(this, { data: { ...data, fileInfo: infos[index] || {} }, files: [file] }, opts));
        }
        return results;
      });
    };
    // Native Strapi replaces the original and deletes old variants before all
    // variant operations settle. Fail closed until durable whole-asset replacement
    // is designed; preserve the existing row, original and every format on failure.
    service.replace = async () => fail("media_replace_disabled", "Binary media replacement is unavailable. Upload a new image instead; existing media is unchanged.", 409);
    return service;
  }
  return { wrapProvider, wrapUpload };
}
module.exports = { admitRaster, createMediaAdmission };
