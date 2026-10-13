import { quotePrintError, validPrintableQuote } from './print.js';

const failure = status => Object.assign(new Error('Print access could not be confirmed'), { status });

// A mounted account/tenant/login owns one controller. All async continuations are
// bounded by both that scope and an operation sequence, even if fetch ignores abort.
export function createQuotePrintSession({ id, userId, organizationId, readProfile, readQuote, isCurrent, onChange, showPaper, hidePaper, print }) {
  let active = true, sequence = 0, controller, busy = false, grant = null;
  const current = () => active && isCurrent();
  const publish = (value, immediate = false) => { if (current()) onChange(value, immediate); };
  const invalidate = () => {
    grant = null;
    hidePaper(); // Synchronous DOM gate: do not wait for React to commit a logout.
    sequence += 1;
    controller?.abort();
    controller = null;
    busy = false;
  };
  const owns = operation => current() && operation === sequence;
  const clear = (message = '') => {
    invalidate();
    publish({ status: 'idle', data: null, error: '', message });
  };
  async function load(forPrint = false) {
    if (!current() || busy) return;
    invalidate();
    busy = true;
    const operation = sequence;
    controller = new AbortController();
    const signal = controller.signal;
    publish({ status: 'loading', data: null, error: '', message: '' });
    try {
      const profile = await readProfile(signal);
      if (!owns(operation)) return;
      if (profile?.user?.id !== userId || profile?.organization?.id !== organizationId || !Array.isArray(profile?.permissions) || !profile.permissions.includes('quote.read')) throw failure(403);
      // The existing endpoint performs CURRENT quote.read + owner/tenant lookup.
      // A successful /me alone is never enough to unlock a cached request.
      const data = await readQuote(id, signal);
      if (!owns(operation)) return;
      if (!validPrintableQuote(data, id)) throw failure(502);
      publish({ status: forPrint ? 'printing' : 'ready', data, error: '', message: '' }, forPrint);
      if (!forPrint) { busy = false; return; }
      if (!owns(operation)) return;
      grant = operation;
      try {
        // Native print() returns void. Await also lets acceptance tests delegate
        // to the browser's real PDF lifecycle, without bypassing beforeprint.
        await print();
      } finally {
        if (owns(operation)) clear('Для повторной печати нажмите «Печать»: доступ будет проверен заново.');
      }
    } catch (error) {
      if (!owns(operation)) return;
      invalidate();
      publish({ status: 'error', data: null, error: quotePrintError(error), message: '' });
    }
  }
  return {
    load: () => load(false),
    print: () => load(true),
    beforePrint() {
      if (grant !== null && grant === sequence && current()) {
        grant = null; // Single use: another native invocation must fail closed.
        showPaper();
      } else clear('Для печати нажмите «Печать»: доступ будет проверен заново.');
    },
    afterPrint() { clear('Для повторной печати нажмите «Печать»: доступ будет проверен заново.'); },
    clear,
    sessionChanged() { if (!current()) clear(); },
    dispose() { active = false; invalidate(); },
  };
}
