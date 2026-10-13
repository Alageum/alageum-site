import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { crc32, inflateSync } from 'node:zlib';

export const MAX_GROUP_BYTES = 24 * 1024 * 1024;
export const MAX_MOBILE_PARTS = 4;
const roots = ['catalog-browser.log', 'playwright-report', 'test-results'];
const reportPath = 'playwright-report/catalog-results.json';
const metricName = /-(pixels|panel-context|icon-surface)\.json$/;
const json = value => `${JSON.stringify(value, null, 2)}\n`;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const within = (root, target) => target === root || target.startsWith(`${root}${path.sep}`);
const manifestEntry = file => Object.fromEntries(Object.entries(file).filter(([key]) => key !== 'body'));

// Only existing catalog diagnostics are eligible. Trace archives, videos,
// network dumps and all other files remain solely in the original full upload.
export function diagnosticGroup(relative) {
  if (relative.includes('\\') || relative.split('/').some(part => !part || part === '.' || part === '..')) return null;
  if (relative === 'catalog-browser.log' || relative === reportPath || relative === 'test-results/.last-run.json') return 'report';
  if (!/^(test-results|playwright-report)\//.test(relative)) return null;
  if (relative.split('/').some(part => /^(trace|traces|network|resources)([.-]|$)/i.test(part))) return null;
  if (/(?:-pixels|-panel-context|-icon-surface)(?:-[a-f0-9]+)?\.json$/.test(relative) || relative.endsWith('/error-context.md')) return 'report';
  if (!relative.endsWith('.png')) return null;
  const project = /^test-results\/[^/]*-catalog-(desktop|mobile)(?:-retry\d+)?\//.exec(relative);
  return project ? project[1] : 'shared';
}

function checkedFile(sourceRoot, relative) {
  const absolute = path.join(sourceRoot, relative);
  let current = sourceRoot;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error(`Symlink excluded: ${relative}`);
  }
  if (!within(sourceRoot, fs.realpathSync(absolute))) throw new Error(`Path escape excluded: ${relative}`);
  const fd = fs.openSync(absolute, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  const stat = fs.fstatSync(fd);
  if (!stat.isFile()) {
    fs.closeSync(fd);
    throw new Error(`Non-regular file excluded: ${relative}`);
  }
  return { fd, stat };
}

function hashFile(sourceRoot, relative, destination) {
  const { fd, stat } = checkedFile(sourceRoot, relative);
  let output;
  try {
    if (destination) {
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      output = fs.openSync(destination, 'wx');
    }
    const hash = createHash('sha256');
    const buffer = Buffer.alloc(64 * 1024);
    let size = 0;
    for (let read; (read = fs.readSync(fd, buffer, 0, buffer.length, null));) {
      const bytes = buffer.subarray(0, read);
      hash.update(bytes);
      if (output !== undefined) fs.writeFileSync(output, bytes);
      size += read;
      if (size > stat.size) throw new Error(`Source grew while reading: ${relative}`);
    }
    const after = fs.fstatSync(fd);
    if (size !== stat.size || after.size !== stat.size || after.mtimeMs !== stat.mtimeMs || after.ctimeMs !== stat.ctimeMs) {
      throw new Error(`Source changed while reading: ${relative}`);
    }
    return { size, sha256: hash.digest('hex') };
  } finally {
    fs.closeSync(fd);
    if (output !== undefined) fs.closeSync(output);
  }
}

function readCheckedBytes(sourceRoot, relative, maximum) {
  const { fd, stat } = checkedFile(sourceRoot, relative);
  try {
    if (stat.size > maximum) throw new Error(`Source exceeds bounded read limit: ${relative}`);
    const bytes = Buffer.alloc(stat.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(fd, bytes, offset, bytes.length - offset, null);
      if (!count) throw new Error(`Source shortened while reading: ${relative}`);
      offset += count;
    }
    if (fs.readSync(fd, Buffer.alloc(1), 0, 1, null)) throw new Error(`Source grew while reading: ${relative}`);
    return bytes;
  } finally { fs.closeSync(fd); }
}

function validatePNG(body, budget) {
  const fail = reason => { throw new Error(`Invalid or unsupported PNG: ${reason}`); };
  if (!body.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) fail('signature');
  let header;
  let palette = false;
  let endedData = false;
  const imageData = [];
  let offset = 8;
  let ended = false;
  while (offset + 12 <= body.length) {
    const length = body.readUInt32BE(offset);
    const type = body.toString('latin1', offset + 4, offset + 8);
    const end = offset + length + 12;
    if (end > body.length || !/^[A-Za-z]{2}[A-Z][A-Za-z]$/.test(type)) fail('chunk framing');
    if (crc32(body.subarray(offset + 4, end - 4)) !== body.readUInt32BE(end - 4)) fail(`${type} CRC`);
    if (offset === 8 && type !== 'IHDR') fail('IHDR must be first');
    if (type === 'IHDR') {
      if (header || length !== 13) fail('IHDR shape/order');
      const width = body.readUInt32BE(offset + 8), height = body.readUInt32BE(offset + 12);
      const depth = body[offset + 16], color = body[offset + 17], interlace = body[offset + 20];
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      if (!width || !height || width > 0x7fffffff || height > 0x7fffffff || !depths[color]?.includes(depth) || body[offset + 18] || body[offset + 19] || interlace > 1) fail('IHDR fields');
      header = { width, height, depth, color, interlace };
    } else if (type === 'PLTE') {
      if (palette || imageData.length || !length || length % 3 || length > 768 || [0, 4].includes(header.color) || (header.color === 3 && length / 3 > 2 ** header.depth)) fail('PLTE shape/order');
      palette = true;
    } else if (type === 'IDAT') {
      if (endedData || (header.color === 3 && !palette)) fail('IDAT order/palette');
      imageData.push(body.subarray(offset + 8, end - 4));
    } else if (type === 'IEND') {
      if (length || !imageData.length || end !== body.length) fail('IEND shape/order');
      ended = true;
    } else {
      if (/^[A-Z]/.test(type) || ['acTL', 'fcTL', 'fdAT'].includes(type)) fail(`unhandled chunk ${type}`);
    }
    if (imageData.length && type !== 'IDAT') endedData = true;
    offset = end;
    if (ended) break;
  }
  if (!ended || offset !== body.length) fail('missing final IEND');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.color];
  const passes = header.interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = passes.map(([x, y, dx, dy]) => {
    const width = Math.max(0, Math.ceil((header.width - x) / dx));
    const height = Math.max(0, Math.ceil((header.height - y) / dy));
    return { height: width ? height : 0, stride: Math.ceil(width * channels * header.depth / 8) + 1 };
  });
  const expectedBytes = rows.reduce((total, row) => total + row.height * row.stride, 0);
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes > 64 * 1024 * 1024 || expectedBytes > budget.remaining) fail('inflation budget exceeded (64 MiB/image, 2 GiB/export)');
  budget.remaining -= expectedBytes;
  const compressed = Buffer.concat(imageData);
  const inflated = inflateSync(compressed, { maxOutputLength: expectedBytes, info: true });
  if (inflated.engine.bytesWritten !== compressed.length || inflated.buffer.length !== expectedBytes) fail('compressed stream or scanline length');
  offset = 0;
  for (const row of rows) for (let y = 0; y < row.height; y++, offset += row.stride) if (inflated.buffer[offset] > 4) fail('scanline filter');
  return { width: header.width, height: header.height, inflatedBytes: expectedBytes, validation: 'chunk-crc-zlib-scanlines' };
}

function decodeInlineAttachments(bytes, sourceSha256, issues, sourceRoot, inventory, pngBudget) {
  const index = { version: 2, source: `frontend/${reportPath}`, sourceSha256, sourceBytes: bytes.length, attachments: [], tests: [], results: [] };
  const decoded = [];
  let originalSafeForCompact = true;
  let sourceReport;
  let totalBytes = 0;
  try {
    const report = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    sourceReport = report;
    const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
    const problem = (pointer, reason) => { originalSafeForCompact = false; issues.push(`Invalid or incomplete report at ${pointer}: ${reason}`); };
    if (!object(report)) throw new Error('Report must be an object');
    index.stats = report.stats;
    index.errors = report.errors;
    const counters = ['expected', 'unexpected', 'flaky', 'skipped'];
    const validStats = object(report.stats) && counters.every(key => Number.isSafeInteger(report.stats[key]) && report.stats[key] >= 0);
    if (!validStats) problem('/stats', 'Expected nonnegative integer expected/unexpected/flaky/skipped source counters');
    if (!Array.isArray(report.errors)) problem('/errors', 'Expected an errors array');
    function suites(items, pointer) {
      for (const [suiteIndex, suite] of items.entries()) {
        const suitePointer = `${pointer}/${suiteIndex}`;
        if (!object(suite)) { problem(suitePointer, 'Expected a suite object'); continue; }
        if (!Array.isArray(suite.specs)) problem(`${suitePointer}/specs`, 'Expected specs array');
        for (const [specIndex, spec] of (Array.isArray(suite.specs) ? suite.specs : []).entries()) {
          const specPointer = `${suitePointer}/specs/${specIndex}`;
          if (!object(spec) || !Array.isArray(spec.tests) || !spec.tests.length) { problem(specPointer, 'Expected spec with nonempty tests array'); continue; }
          for (const [testIndex, test] of spec.tests.entries()) {
            const testPointer = `${specPointer}/tests/${testIndex}`;
            const testItem = { pointer: testPointer, title: spec.title, disposition: 'invalid' };
            index.tests.push(testItem);
            if (!object(test)) { problem(testPointer, 'Expected test object'); continue; }
            Object.assign(testItem, { projectName: test.projectName, sourceStatus: test.status, expectedStatus: test.expectedStatus });
            if (!Array.isArray(test.results)) { problem(`${testPointer}/results`, 'Expected results array'); continue; }
            testItem.resultCount = test.results.length;
            if (!test.results.length) {
              testItem.disposition = test.status === 'skipped' && test.expectedStatus === 'skipped' ? 'explicitly-skipped-without-result' : 'missing-results';
              if (testItem.disposition === 'missing-results') problem(`${testPointer}/results`, 'No result and no explicit expected skip');
              continue;
            }
            testItem.disposition = 'has-results';
            for (const [resultIndex, result] of test.results.entries()) {
              const resultPointer = `${testPointer}/results/${resultIndex}`;
              const resultItem = { pointer: resultPointer, testPointer, disposition: 'invalid' };
              index.results.push(resultItem);
              if (!object(result)) { problem(resultPointer, 'Expected result object'); continue; }
              Object.assign(resultItem, { status: result.status, retry: result.retry, errors: result.errors, disposition: 'observed' });
              if (!['passed', 'failed', 'timedOut', 'skipped', 'interrupted'].includes(result.status) || !Number.isSafeInteger(result.retry) || result.retry < 0 || !Array.isArray(result.errors)) {
                resultItem.disposition = 'invalid'; problem(resultPointer, 'Invalid result status/retry/errors');
              }
              if (!Array.isArray(result.attachments)) { problem(`${resultPointer}/attachments`, 'Expected attachments array'); continue; }
              for (const [attachmentIndex, attachment] of result.attachments.entries()) {
                const pointer = `${resultPointer}/attachments/${attachmentIndex}`;
                const item = { pointer, testPointer, resultPointer, projectName: test.projectName };
                index.attachments.push(item);
                if (object(attachment) && Object.hasOwn(attachment, 'body')) {
                  const value = Buffer.from(JSON.stringify(attachment.body));
                  item.bodyValue = { encoding: 'JSON value before base64 validation', size: value.length, sha256: digest(value) };
                }
                if (!object(attachment) || typeof attachment.name !== 'string' || typeof attachment.contentType !== 'string') {
                  item.status = 'invalid'; item.reason = 'Expected attachment object with string name and contentType';
                  problem(pointer, item.reason); continue;
                }
                Object.assign(item, { name: attachment.name, contentType: attachment.contentType, originalPath: attachment.path });
                const png = attachment.contentType === 'image/png' && typeof attachment.name === 'string' && attachment.name.endsWith('.png');
                const metric = attachment.contentType === 'application/json' && typeof attachment.name === 'string' && metricName.test(attachment.name);
                if (attachment.body === undefined) {
                  if (!png && !metric) {
                    item.status = 'excluded-type'; item.reason = 'Unsupported file attachment remains in the full artifact; its path is not followed.';
                    continue;
                  }
                  const relative = typeof attachment.path === 'string' ? path.relative(sourceRoot, path.resolve(sourceRoot, attachment.path)).split(path.sep).join('/') : '';
                  const referenced = diagnosticGroup(relative) && inventory.find(file => file.path === `frontend/${relative}` && file.status === 'selected' && file.sha256);
                  if (referenced) {
                    Object.assign(item, { status: 'file-reference', path: referenced.path, group: referenced.group, size: referenced.size, sha256: referenced.sha256 });
                  } else {
                    item.status = 'missing-or-excluded-file-reference';
                    item.reason = 'Attachment does not match a selected regular file inside known evidence roots; its path was not followed.';
                    issues.push(`Missing or excluded file attachment at ${pointer}`);
                  }
                  continue;
                }
                try {
                  if (attachment.path !== undefined) throw new Error('Ambiguous attachment has both path and body');
                  const base64 = attachment.body;
                  if (typeof base64 !== 'string') throw new Error('Invalid base64 body type');
                  if (base64.length > Math.ceil(MAX_GROUP_BYTES / 3) * 4) throw new Error('Inline attachment exceeds 24 MiB decode limit');
                  if (base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error('Invalid canonical base64');
                  const body = Buffer.from(base64, 'base64');
                  if (body.toString('base64') !== base64) throw new Error('Invalid base64 padding bits');
                  Object.assign(item, { size: body.length, sha256: digest(body), encodedBodySha256: digest(Buffer.from(base64)) });
                  if (!png && !metric) {
                    originalSafeForCompact = false;
                    item.status = 'excluded-type'; item.reason = 'Unsupported inline payload is hashed but retained only in the full original artifact.';
                    continue;
                  }
                  if (png) item.pngValidation = validatePNG(body, pngBudget);
                  if (metric) {
                    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
                    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON metric body must be an object');
                  }
                  totalBytes += body.length;
                  if (totalBytes > 4 * MAX_GROUP_BYTES) throw new Error('Total inline evidence exceeds 96 MiB decode limit');
                  const group = metric ? 'report' : test.projectName === 'catalog-desktop' ? 'desktop' : test.projectName === 'catalog-mobile' ? 'mobile' : 'shared';
                  // Names and attachment paths never control output paths.
                  const destination = `derived/inline/${String(index.attachments.length).padStart(6, '0')}.${png ? 'png' : 'json'}`;
                  Object.assign(item, { status: 'decoded', path: destination, group, size: body.length, sha256: digest(body) });
                  decoded.push({ path: destination, group, size: body.length, sha256: item.sha256, body, status: 'selected', sourcePointer: pointer });
                } catch (error) {
                  originalSafeForCompact = false;
                  item.status = 'invalid'; item.reason = error.message;
                  issues.push(`Invalid inline attachment at ${pointer}: ${error.message}`);
                }
              }
            }
          }
        }
        if (suite.suites !== undefined) {
          if (!Array.isArray(suite.suites)) problem(`${suitePointer}/suites`, 'Expected child suites array');
          else suites(suite.suites, `${suitePointer}/suites`);
        }
      }
    }
    if (!Array.isArray(report.suites)) problem('/suites', 'Expected suites array');
    else suites(report.suites, '/suites');
    index.observedTestCount = index.tests.length;
    if (!index.tests.length) problem('/suites', 'Report contains no tests');
    if (validStats) {
      index.sourceStatsTotal = counters.reduce((sum, key) => sum + report.stats[key], 0);
      if (index.sourceStatsTotal !== index.observedTestCount) problem('/stats', 'Source total disagrees with observed test entries');
    }
  } catch (error) {
    originalSafeForCompact = false;
    issues.push(`Invalid or incomplete catalog report: ${error.message}`);
  }
  index.issues = [...issues];
  // Keep every non-body value and position. Only attachment bodies are replaced
  // by explicit references into the index; the original report is untouched.
  if (sourceReport) for (const item of index.attachments) {
    const attachment = item.pointer.split('/').slice(1).reduce((value, key) => value?.[key], sourceReport);
    if (attachment && typeof attachment === 'object' && Object.hasOwn(attachment, 'body')) {
      attachment.body = { diagnosticAttachmentPointer: item.pointer };
    }
  }
  return { decoded, index, projection: sourceReport, originalSafeForCompact };
}

export function validateFullArtifact(receipt) {
  if (receipt === undefined) return null;
  const { id, url, sha256, repository, runId, outcome } = receipt || {};
  if (outcome !== 'success' || !/^[1-9][0-9]*$/.test(id || '') || !/^[1-9][0-9]*$/.test(runId || '') || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || repository.split('/').some(part => part === '.' || part === '..') || !/^[a-f0-9]{64}$/.test(sha256 || '') || url !== `https://github.com/${repository}/actions/runs/${runId}/artifacts/${id}` || new URL(url).href !== url) {
    throw new Error('Invalid or missing full-upload artifact provenance');
  }
  return { id, url, sha256, repository, runId, outcome, evidence: 'actions/upload-artifact@v4 receipt; archive not downloaded by collector' };
}

const reserveBytes = limit => Math.min(256 * 1024, Math.floor(limit / 4));
const safeRelative = value => typeof value === 'string' && !value.includes('\\') && value.split('/').every(part => part && part !== '.' && part !== '..') && !path.isAbsolute(value);

export function planMobileParts(files, maxGroupBytes = MAX_GROUP_BYTES) {
  if (!Number.isSafeInteger(maxGroupBytes) || maxGroupBytes < 1024 || maxGroupBytes > MAX_GROUP_BYTES) throw new Error('Invalid mobile byte limit');
  const seen = new Set();
  const parts = [];
  for (const file of [...files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)) {
    if (!safeRelative(file.path) || seen.has(file.path) || !Number.isSafeInteger(file.size) || file.size < 0 || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) throw new Error('Invalid or duplicate mobile file accounting');
    seen.add(file.path);
    if (file.size + reserveBytes(maxGroupBytes) > maxGroupBytes) throw new Error(`Mobile single file exceeds part budget: ${file.path}`);
    let part = parts.at(-1);
    if (!part || part.sourceBytes + file.size + reserveBytes(maxGroupBytes) > maxGroupBytes) {
      if (parts.length === MAX_MOBILE_PARTS) throw new Error('Mobile evidence exceeds four bounded parts');
      part = { name: `mobile-part-${String(parts.length + 1).padStart(3, '0')}`, sourceBytes: 0, files: [] };
      parts.push(part);
    }
    part.files.push(file); part.sourceBytes += file.size;
  }
  return parts;
}

function manifestResult(group, manifest, manifestBytes) {
  return { group, status: manifest.status, files: manifest.files.length, exportedBytes: manifest.exportedBytes, rawBytes: manifest.exportedBytes + manifestBytes, manifestSha256: digest(json(manifest)) };
}

function writeManifestOnly(outputRoot, group, manifest, limit) {
  const encoded = json(manifest);
  if (Buffer.byteLength(encoded) > limit) throw new Error(`Manifest exceeds byte limit: ${group}`);
  fs.mkdirSync(path.join(outputRoot, group));
  fs.writeFileSync(path.join(outputRoot, group, 'manifest.json'), encoded, { flag: 'wx' });
}

function exportGroup(group, files, { sourceRoot, outputRoot, maxGroupBytes, issues, missing, metadata = {}, excluded = [] }) {
  const manifest = {
    version: 2, group, maxGroupBytes, sourceBytes: files.reduce((sum, file) => sum + file.size, 0),
    status: files.length ? 'complete' : 'empty', missing, issues: [...issues],
    files: files.map(manifestEntry), excluded: excluded.map(manifestEntry), ...metadata, exportedBytes: 0,
  };
  if (issues.length || missing.length) manifest.status = 'incomplete';
  const partial = path.join(outputRoot, `.${group}-partial`);
  fs.mkdirSync(partial);
  if (manifest.sourceBytes + Buffer.byteLength(json(manifest)) > maxGroupBytes) {
    manifest.status = 'oversize'; manifest.issues.push('Content plus manifest exceeds cap; no selected files exported.');
  } else if (files.some(file => file.status === 'failed')) {
    manifest.status = 'failed'; manifest.issues.push('A selected source file failed validation; no selected files exported.');
  } else {
    try {
      for (const file of files) {
        if (!safeRelative(file.path)) throw new Error('Unsafe export path');
        const destination = path.join(partial, file.path);
        if (file.body) {
          fs.mkdirSync(path.dirname(destination), { recursive: true });
          fs.writeFileSync(destination, file.body, { flag: 'wx' });
        } else {
          const copied = hashFile(sourceRoot, file.path.slice('frontend/'.length), destination);
          if (copied.size !== file.size || copied.sha256 !== file.sha256) throw new Error(`Source changed before copy: ${file.path}`);
        }
        const checked = hashFile(partial, file.path);
        if (checked.size !== file.size || checked.sha256 !== file.sha256) throw new Error(`Export copy mismatch: ${file.path}`);
        manifest.exportedBytes += checked.size;
      }
    } catch (error) {
      fs.rmSync(partial, { recursive: true }); fs.mkdirSync(partial);
      manifest.exportedBytes = 0; manifest.status = 'failed'; manifest.issues.push(error.message);
    }
  }
  if (manifest.exportedBytes + Buffer.byteLength(json(manifest)) > maxGroupBytes) {
    fs.rmSync(partial, { recursive: true }); fs.mkdirSync(partial);
    manifest.exportedBytes = 0; manifest.status = 'oversize'; manifest.issues.push('Final manifest plus content exceeds cap; no selected files exported.');
  }
  const encoded = json(manifest);
  if (Buffer.byteLength(encoded) > maxGroupBytes) throw new Error(`Manifest itself exceeds cap: ${group}`);
  fs.writeFileSync(path.join(partial, 'manifest.json'), encoded, { flag: 'wx' });
  fs.renameSync(partial, path.join(outputRoot, group));
  return manifestResult(group, manifest, Buffer.byteLength(encoded));
}

export function verifyMobilePartitions(outputRoot, limit = MAX_GROUP_BYTES, expectedFiles) {
  outputRoot = fs.realpathSync(outputRoot);
  const master = JSON.parse(readCheckedBytes(outputRoot, 'mobile/manifest.json', limit));
  if (!['complete-partitioned', 'empty'].includes(master.status) || !Array.isArray(master.parts) || master.parts.length > MAX_MOBILE_PARTS || !Array.isArray(master.files)) throw new Error('Mobile partition export is incomplete');
  const masterFiles = new Map();
  for (const file of master.files) {
    if (!safeRelative(file.path) || masterFiles.has(file.path)) throw new Error('Mobile master has unsafe or duplicate paths');
    masterFiles.set(file.path, file);
  }
  if (expectedFiles && (expectedFiles.length !== masterFiles.size || expectedFiles.some(file => masterFiles.get(file.path)?.sha256 !== file.sha256 || masterFiles.get(file.path)?.size !== file.size))) throw new Error('Mobile source accounting mismatch');
  const seen = new Set(); let exportedBytes = 0;
  for (const [offset, part] of master.parts.entries()) {
    const name = `mobile-part-${String(offset + 1).padStart(3, '0')}`;
    if (part.group !== name || part.status !== 'complete') throw new Error('Invalid mobile part identity or status');
    const bytes = readCheckedBytes(outputRoot, `${name}/manifest.json`, limit);
    if (digest(bytes) !== part.manifestSha256) throw new Error(`Mobile part manifest hash mismatch: ${name}`);
    const manifest = JSON.parse(bytes);
    if (manifest.group !== name || manifest.status !== 'complete' || !Array.isArray(manifest.files) || manifest.files.length !== part.files) throw new Error('Mobile part metadata mismatch');
    const actualFiles = [];
    function listFiles(relative) {
      for (const entry of fs.readdirSync(path.join(outputRoot, relative)).sort()) {
        const child = `${relative}/${entry}`;
        const stat = fs.lstatSync(path.join(outputRoot, child));
        if (stat.isSymbolicLink()) throw new Error('Symlink in mobile export');
        if (stat.isDirectory()) listFiles(child);
        else if (stat.isFile()) actualFiles.push(child.slice(name.length + 1));
        else throw new Error('Non-regular mobile export entry');
      }
    }
    listFiles(name);
    const accountedFiles = new Set(['manifest.json', ...manifest.files.map(file => file.path)]);
    if (actualFiles.length !== accountedFiles.size || actualFiles.some(file => !accountedFiles.has(file))) throw new Error('Unaccounted files in mobile partition');
    let partBytes = 0;
    for (const file of manifest.files) {
      const expected = masterFiles.get(file.path);
      if (!safeRelative(file.path) || seen.has(file.path) || !expected || expected.partition !== name || file.size !== expected.size || file.sha256 !== expected.sha256) throw new Error('Mobile partition mapping collision or mismatch');
      seen.add(file.path);
      const actual = hashFile(outputRoot, `${name}/${file.path}`);
      if (actual.size !== file.size || actual.sha256 !== file.sha256) throw new Error(`Mobile partition body mismatch: ${file.path}`);
      partBytes += file.size;
    }
    if (partBytes !== manifest.sourceBytes || partBytes !== manifest.exportedBytes || partBytes !== part.exportedBytes || partBytes + bytes.length !== part.rawBytes || part.rawBytes > limit) throw new Error('Mobile part byte accounting mismatch');
    exportedBytes += partBytes;
  }
  const actualParts = fs.readdirSync(outputRoot).filter(name => /^mobile-part-/.test(name));
  if (actualParts.length !== master.parts.length || seen.size !== masterFiles.size || master.selectedCount !== seen.size || master.sourceBytes !== exportedBytes || master.exportedBytes !== exportedBytes) throw new Error('Missing, extra or unaccounted mobile partitions');
  return { parts: master.parts.length, files: seen.size, exportedBytes };
}

export function prepareCatalogDiagnostics({ sourceRoot, outputRoot, maxGroupBytes = MAX_GROUP_BYTES, fullArtifact }) {
  sourceRoot = path.resolve(sourceRoot);
  outputRoot = path.resolve(outputRoot);
  if (!Number.isSafeInteger(maxGroupBytes) || maxGroupBytes < 1024 || maxGroupBytes > MAX_GROUP_BYTES) throw new Error('Invalid diagnostic byte limit');
  if (fs.lstatSync(sourceRoot).isSymbolicLink()) throw new Error('Source root must not be a symlink');
  sourceRoot = fs.realpathSync(sourceRoot);
  outputRoot = path.join(fs.realpathSync(path.dirname(outputRoot)), path.basename(outputRoot));
  if (roots.some(root => within(path.join(sourceRoot, root), outputRoot)) || within(outputRoot, sourceRoot)) throw new Error('Output overlaps source evidence');
  // Refuse existing output, including symlinks, rather than overwriting evidence.
  fs.mkdirSync(outputRoot);
  const inventory = [];
  const issues = [];
  const missing = [];
  const pngBudget = { remaining: 2 * 1024 * 1024 * 1024 };
  let receipt;
  try { receipt = validateFullArtifact(fullArtifact); } catch (error) { issues.push(error.message); }
  let decodedReport;

  function visit(relative) {
    const absolute = path.join(sourceRoot, relative);
    try {
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) {
        issues.push(`Excluded unsafe entry: ${relative}`);
        inventory.push({ path: `frontend/${relative}`, status: 'excluded-unsafe' });
      } else if (stat.isDirectory()) {
        for (const name of fs.readdirSync(absolute).sort()) visit(`${relative}/${name}`);
      } else {
        const group = diagnosticGroup(relative);
        inventory.push({ path: `frontend/${relative}`, group, size: stat.size, status: group ? 'selected' : 'excluded-by-selection' });
      }
    } catch (error) {
      issues.push(`Cannot inspect ${relative}: ${error.code || error.message}`);
    }
  }

  for (const root of roots) {
    try { fs.lstatSync(path.join(sourceRoot, root)); } catch (error) {
      if (error.code === 'ENOENT') { missing.push(`frontend/${root}`); continue; }
      issues.push(`Cannot inspect ${root}: ${error.code || error.message}`);
      continue;
    }
    visit(root);
  }
  if (!inventory.some(file => file.path === `frontend/${reportPath}` && file.status === 'selected')) missing.push(`frontend/${reportPath}`);
  for (const file of inventory.filter(file => file.group)) {
    try {
      const relative = file.path.slice('frontend/'.length);
      Object.assign(file, hashFile(sourceRoot, relative));
      if (relative.endsWith('.png') && file.size <= maxGroupBytes) {
        const bytes = readCheckedBytes(sourceRoot, relative, maxGroupBytes);
        if (digest(bytes) !== file.sha256) throw new Error(`PNG changed before validation: ${relative}`);
        file.pngValidation = validatePNG(bytes, pngBudget);
      }
    } catch (error) {
      file.status = 'failed';
      issues.push(error.message);
    }
  }

  const sourceReport = inventory.find(file => file.path === `frontend/${reportPath}` && file.sha256);
  if (sourceReport) {
    if (sourceReport.size > 128 * 1024 * 1024) {
      issues.push('Catalog report exceeds the 128 MiB parsing limit; inline evidence was not decoded');
    } else {
      try {
        const bytes = readCheckedBytes(sourceRoot, reportPath, 128 * 1024 * 1024);
        if (digest(bytes) !== sourceReport.sha256) throw new Error('Report changed before inline decoding');
        decodedReport = decodeInlineAttachments(bytes, sourceReport.sha256, issues, sourceRoot, inventory, pngBudget);
        const { decoded, originalSafeForCompact } = decodedReport;
        inventory.push(...decoded);
        if (!originalSafeForCompact) {
          sourceReport.group = null;
          sourceReport.status = 'retained-in-full-artifact';
          sourceReport.reason = 'Original report contains excluded or invalid inline data; exact original remains in the full artifact.';
        }
      } catch (error) { issues.push(error.message); }
    }
  }

  const mobileFiles = inventory.filter(file => file.group === 'mobile');
  let parts = [];
  try { parts = planMobileParts(mobileFiles, maxGroupBytes); } catch (error) { issues.push(error.message); }
  const partForPath = new Map(parts.flatMap(part => part.files.map(file => [file.path, part.name])));
  const results = [];
  const common = { sourceRoot, outputRoot, maxGroupBytes, issues, missing };
  for (const group of ['desktop', 'shared']) results.push(exportGroup(group, inventory.filter(file => file.group === group), common));
  const partResults = parts.map(part => exportGroup(part.name, part.files, common));
  const mobile = {
    version: 2, group: 'mobile', storage: 'partitioned', maxGroupBytes,
    status: !issues.length && !missing.length && partResults.every(part => part.status === 'complete') ? (mobileFiles.length ? 'complete-partitioned' : 'empty') : 'incomplete',
    selectedCount: mobileFiles.length, sourceBytes: mobileFiles.reduce((sum, file) => sum + file.size, 0),
    exportedBytes: partResults.reduce((sum, part) => sum + part.exportedBytes, 0),
    files: mobileFiles.map(file => ({ ...manifestEntry(file), partition: partForPath.get(file.path) || null })),
    parts: partResults, issues: [...issues], missing,
  };
  writeManifestOnly(outputRoot, 'mobile', mobile, maxGroupBytes);
  try { verifyMobilePartitions(outputRoot, maxGroupBytes, mobileFiles); } catch (error) {
    issues.push(error.message); mobile.status = 'incomplete'; mobile.issues.push(error.message);
    fs.writeFileSync(path.join(outputRoot, 'mobile/manifest.json'), json(mobile));
    if (Buffer.byteLength(json(mobile)) > maxGroupBytes) throw new Error('Mobile failure manifest exceeds cap');
  }
  results.push({ ...manifestResult('mobile', mobile, Buffer.byteLength(json(mobile))), rawBytes: Buffer.byteLength(json(mobile)) }, ...partResults);

  const rawReport = sourceReport ? {
    path: sourceReport.path, size: sourceReport.size, sha256: sourceReport.sha256,
    hashEvidence: 'computed from local source bytes by collector',
    fullArchiveRetention: receipt ? 'upload-action-receipt-recorded' : 'unverified',
    disposition: sourceReport.group ? 'selected-for-compact-report' : 'full-artifact-only',
    fullArtifact: receipt || null,
  } : { disposition: 'missing' };
  if (sourceReport && sourceReport.size > maxGroupBytes) {
    sourceReport.group = null; sourceReport.status = 'oversize-retained-in-full-artifact';
    rawReport.disposition = 'full-artifact-only';
  }
  if (rawReport.disposition === 'full-artifact-only' && !receipt) issues.push('Raw report requires a valid successful full-upload receipt');
  const coverage = {
    rawReport,
    derivedReport: { status: decodedReport && !decodedReport.index.issues.length ? 'complete-non-body-fields' : 'incomplete', exportEvidence: 'report group manifest controls exported availability', attachmentCount: decodedReport?.index.attachments.length || 0 },
    mobile: { status: mobile.status, selectedCount: mobile.selectedCount, selectedBytes: mobile.sourceBytes, exportedBytes: mobile.exportedBytes, partCount: parts.length },
  };
  if (decodedReport) {
    for (const item of decodedReport.index.attachments) {
      if (item.path && item.group) {
        item.partition = item.group === 'mobile' ? partForPath.get(item.path) || null : item.group;
        item.exportStatus = results.find(result => result.group === item.partition)?.status || (item.group === 'report' ? 'recorded-in-report-manifest' : 'not-exported');
      } else item.partition = null;
    }
    decodedReport.index.coverage = coverage;
    decodedReport.index.issues = [...issues];
    for (const [name, value] of [['catalog-index.json', decodedReport.index], ['catalog-report.json', decodedReport.projection]]) {
      const body = Buffer.from(json(value ?? null));
      inventory.push({ path: `derived/${name}`, group: 'report', size: body.length, sha256: digest(body), body, status: 'selected' });
    }
  }
  // A small original can still overflow once projection/metrics are included.
  const selectedReport = inventory.filter(file => file.group === 'report');
  if (sourceReport?.group && selectedReport.reduce((sum, file) => sum + file.size, 0) + reserveBytes(maxGroupBytes) > maxGroupBytes) {
    sourceReport.group = null; sourceReport.status = 'oversize-retained-in-full-artifact';
    rawReport.disposition = 'full-artifact-only';
    if (!receipt) issues.push('Raw report requires a valid successful full-upload receipt');
    const indexFile = inventory.find(file => file.path === 'derived/catalog-index.json');
    if (indexFile) {
      decodedReport.index.issues = [...issues]; indexFile.body = Buffer.from(json(decodedReport.index));
      indexFile.size = indexFile.body.length; indexFile.sha256 = digest(indexFile.body);
    }
  }
  results.push(exportGroup('report', inventory.filter(file => file.group === 'report'), { ...common, metadata: { coverage }, excluded: inventory.filter(file => !file.group) }));
  return { ok: !issues.length && !missing.length && results.every(result => ['complete', 'complete-partitioned', 'empty'].includes(result.status)), mobilePartCount: mobile.status === 'complete-partitioned' ? parts.length : 0, coverage, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 3) throw new Error('Usage: node scripts/prepare-catalog-diagnostics.mjs OUTPUT_DIRECTORY');
    const result = prepareCatalogDiagnostics({
      sourceRoot: path.resolve(fileURLToPath(new URL('..', import.meta.url))), outputRoot: process.argv[2],
      fullArtifact: {
        id: process.env.CATALOG_FULL_ARTIFACT_ID, url: process.env.CATALOG_FULL_ARTIFACT_URL,
        sha256: process.env.CATALOG_FULL_ARTIFACT_DIGEST, outcome: process.env.CATALOG_FULL_UPLOAD_OUTCOME,
        repository: process.env.GITHUB_REPOSITORY, runId: process.env.GITHUB_RUN_ID,
      },
    });
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `mobile_part_count=${result.mobilePartCount}\n`);
    console.log(json(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`Catalog diagnostic preparation failed: ${JSON.stringify(error.message)}`);
    process.exitCode = 1;
  }
}
