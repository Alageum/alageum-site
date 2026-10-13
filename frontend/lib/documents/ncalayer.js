import { validBase64, MAX_DOCUMENT_BYTES, MAX_SIGNATURE_BYTES } from './signingData.js';

export const NCALAYER_ENDPOINT = 'wss://127.0.0.1:13579/';
export const NCALAYER_TIMEOUT_MS = 120000;
const MAX_FRAME_CHARACTERS = 4 * Math.ceil(MAX_SIGNATURE_BYTES / 3) + 8192;
const failure = code => Object.assign(new Error(code), { code });

// One explicit user action owns one connection and one sign request. Never
// launch NCALayer, retry a signature, select a key, or accept a certificate here.
export function signWithNCALayer(contentBase64, { signal, WebSocketImpl = globalThis.WebSocket, timeoutMs = NCALAYER_TIMEOUT_MS } = {}) {
  if (!validBase64(contentBase64, MAX_DOCUMENT_BYTES)) return Promise.reject(failure('invalid_signing_content'));
  if (signal?.aborted) return Promise.reject(failure('signing_cancelled'));
  if (typeof WebSocketImpl !== 'function') return Promise.reject(failure('ncalayer_unavailable'));
  return new Promise((resolve, reject) => {
    let socket, timer, settled = false, sent = false;
    const finish = (error, signature) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (socket) {
        socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
        try { socket.close(); } catch { /* The local endpoint may already be closed. */ }
      }
      if (error) reject(error); else resolve(signature);
    };
    const abort = () => finish(failure('signing_cancelled'));
    try { socket = new WebSocketImpl(NCALAYER_ENDPOINT); } catch { finish(failure('ncalayer_unavailable')); return; }
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(failure('ncalayer_timeout')), Math.max(1, Math.min(timeoutMs, NCALAYER_TIMEOUT_MS)));
    socket.onopen = () => {
      if (settled || sent || signal?.aborted) { if (signal?.aborted) abort(); return; }
      sent = true;
      try {
        socket.send(JSON.stringify({ module: 'kz.gov.pki.knca.basics', method: 'sign', args: {
          format: 'cms', data: contentBase64,
          signingParams: { decode: true, encapsulate: false, digested: false },
          signerParams: { extKeyUsageOids: ['1.3.6.1.5.5.7.3.4'] }, locale: 'ru',
        } }));
      } catch { finish(failure('ncalayer_disconnected')); }
    };
    socket.onmessage = event => {
      if (settled) return;
      try {
        if (!sent || typeof event.data !== 'string' || event.data.length > MAX_FRAME_CHARACTERS) throw failure('ncalayer_invalid_response');
        const response = JSON.parse(event.data);
        if (response?.status === false) { finish(failure('ncalayer_declined')); return; }
        const result = response?.body?.result;
        const signature = Array.isArray(result) && result.length === 1 ? result[0] : result;
        if (response?.status !== true || !validBase64(signature, MAX_SIGNATURE_BYTES)) throw failure('ncalayer_invalid_response');
        finish(null, signature);
      } catch { finish(failure('ncalayer_invalid_response')); }
    };
    socket.onerror = () => finish(failure('ncalayer_unavailable'));
    socket.onclose = () => finish(failure('ncalayer_disconnected'));
    if (signal?.aborted) abort();
  });
}
