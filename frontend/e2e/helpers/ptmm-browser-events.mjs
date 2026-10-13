import { mkdir, writeFile, readFile, rename, rm } from 'node:fs/promises';
import path from 'node:path';

export const browserEventLimits = Object.freeze({ maxEvents: 128, maxEventBytes: 32_768, maxTextBytes: 2_048, maxErrors: 8, maxArtifactBytes: 49_152 });
const clip = (value, maxBytes) => {
  const text = typeof value === 'string' ? value : String(value ?? '');
  let result = '', bytes = 0, index = 0;
  while (index < text.length) {
    const character = String.fromCodePoint(text.codePointAt(index)), size = Buffer.byteLength(character);
    if (bytes + size > maxBytes) break;
    result += character; bytes += size; index += character.length;
  }
  return { text: result, truncated: index < text.length };
};

/** Actual page events only; runner stdout is retained separately by CI.
 * finish() runs from afterEach even when the case fails and attempts both a
 * standalone file and an attachment. Capture/persistence limitations are explicit.
 */
export function capturePtmmBrowserEvents(page, testInfo, { limits = browserEventLimits, io = { mkdir, writeFile, readFile, rename, rm } } = {}) {
  limits = Object.freeze({ ...browserEventLimits, ...limits });
  for (const [key, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value <= 0 || value > browserEventLimits[key]) throw new Error(`Invalid browser event limit ${key}`);
  }
  const started = Date.now(), events = [], errors = [];
  const viewport = page.viewportSize();
  let eventBytes = 0, droppedEvents = 0, truncatedEvents = 0, omittedErrors = 0, consoleCount = 0, pageErrorCount = 0, finished = false;
  const identity = {
    testId: clip(testInfo.testId, 256).text, title: clip(testInfo.title, 512).text,
    project: clip(testInfo.project.name, 128).text, viewport: viewport ? { width: viewport.width, height: viewport.height } : null,
    retry: testInfo.retry, workerIndex: testInfo.workerIndex,
  };
  const error = (stage, value) => {
    if (errors.length < limits.maxErrors) errors.push({ stage, message: clip(value?.message || value, 512).text });
    else omittedErrors++;
  };
  const add = (kind, read) => {
    if (finished) return;
    if (kind === 'pageerror') pageErrorCount++; else consoleCount++;
    if (events.length >= limits.maxEvents || eventBytes >= limits.maxEventBytes) { droppedEvents++; return; }
    try {
      const raw = read(), message = clip(raw.message, limits.maxTextBytes), location = clip(raw.url || '', 512), level = clip(raw.level || kind, 32);
      const entry = { kind, level: level.text, elapsedMs: Date.now() - started, message: message.text,
        ...(location.text ? { location: { url: location.text, line: raw.line ?? null, column: raw.column ?? null } } : {}),
        truncated: message.truncated || location.truncated || level.truncated };
      const bytes = Buffer.byteLength(JSON.stringify(entry)) + 1;
      if (eventBytes + bytes > limits.maxEventBytes) { droppedEvents++; return; }
      events.push(entry); eventBytes += bytes; if (entry.truncated) truncatedEvents++;
    } catch (failure) { error(`read-${kind}`, failure); }
  };
  const onConsole = message => add('console', () => {
    const at = message.location();
    return { level: message.type(), message: message.text(), url: at.url, line: at.lineNumber, column: at.columnNumber };
  });
  const onPageError = failure => add('pageerror', () => ({ level: 'error', message: failure.stack || failure.message || String(failure) }));
  page.on('console', onConsole); page.on('pageerror', onPageError);
  return {
    async finish() {
      if (finished) throw new Error('Browser event evidence already finalized');
      finished = true;
      for (const [name, listener] of [['console', onConsole], ['pageerror', onPageError]]) {
        try { page.off(name, listener); } catch (failure) { error(`detach-${name}`, failure); }
      }
      const retention = { file: 'pending', attachment: 'pending', saved: false };
      let file = null;
      try { file = testInfo.outputPath('browser-events.json'); }
      catch (failure) { retention.file = 'error'; error('resolve-output-path', failure); }
      const payload = () => ({ format: 'ptmm-browser-events-v1', identity,
        outcome: { statusAtCaptureFinish: testInfo.status, expectedStatus: testInfo.expectedStatus },
        capture: { status: errors.length || omittedErrors ? 'partial-error' : droppedEvents || truncatedEvents ? 'truncated' : 'complete',
          eventCount: events.length, eventBytes, consoleCount, pageErrorCount, droppedEvents, truncatedEvents, omittedErrors, errors, limits }, retention, events });
      const bytes = () => {
        let body = Buffer.from(JSON.stringify(payload(), null, 2));
        while (body.length > limits.maxArtifactBytes && events.length) {
          const removed = events.pop(); eventBytes -= Buffer.byteLength(JSON.stringify(removed)) + 1;
          if (removed.truncated) truncatedEvents--;
          droppedEvents++; body = Buffer.from(JSON.stringify(payload(), null, 2));
        }
        if (body.length > limits.maxArtifactBytes) throw new Error('Browser event metadata exceeds its artifact budget');
        return body;
      };
      // Never open the retained file for rewriting. A partial temp write or a
      // failed rename leaves the previous committed snapshot untouched.
      const expectedBodies = [];
      let validFile = false, validAttachment = false;
      const verifyFile = async () => {
        if (!file) return false;
        try {
          const actual = await io.readFile(file);
          return expectedBodies.some(body => body.equals(Buffer.from(actual)));
        } catch (failure) { error('verify-file', failure); return false; }
      };
      const persist = async stage => {
        if (!file) return;
        const temporary = `${file}.pending`;
        let committed = false;
        try {
          await io.mkdir(path.dirname(file), { recursive: true });
          const body = bytes(); expectedBodies.push(body);
          await io.writeFile(temporary, body);
          await io.rename(temporary, file);
          committed = true;
        } catch (failure) { error(stage, failure); }
        finally {
          try { await io.rm(temporary, { force: true }); } catch (failure) { error('cleanup-temp', failure); }
        }
        validFile = await verifyFile();
        retention.file = validFile ? committed ? 'written' : 'preserved' : 'error';
        retention.saved = validFile || validAttachment;
      };
      await persist('write-file');
      try { await testInfo.attach('browser-events', { body: bytes(), contentType: 'application/json' }); retention.attachment = 'attached'; validAttachment = true; }
      catch (failure) { retention.attachment = 'error'; error('attach', failure); }
      retention.saved = validFile || validAttachment;
      // Include late transport status when possible, while keeping a previous
      // known-good file if this atomic replacement fails.
      await persist('write-final-status');
      // saved is a current validity result, never a historical success flag.
      validFile = await verifyFile();
      if (!validFile) retention.file = 'error';
      retention.saved = validFile || validAttachment;
      if (!retention.saved) throw new Error(`Browser event evidence could not be retained: ${JSON.stringify(payload().capture.errors)}`);
      return payload();
    },
  };
}
