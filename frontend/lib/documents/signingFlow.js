import { verifyIntentBytes } from './signingData.js';

export const initialSigningState = () => ({ status: 'loading', value: null, signature: null, error: null });
const failure = code => Object.assign(new Error(code), { code });
const busy = status => ['preparing', 'signing', 'submitting', 'verifying'].includes(status);

export function signingError(error) {
  if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
  if (error?.status === 403) return 'Нет доступа к подписанию документов.';
  if (error?.status === 409 || error?.status === 410 || error?.code === 'signing_intent_expired') return 'Версия документа или срок запроса изменились. Закройте панель и проверьте документ заново.';
  if (error?.code === 'signing_crypto_unavailable') return 'Браузер не поддерживает безопасную проверку SHA-256. Подписание недоступно.';
  if (error?.code === 'document_hash_mismatch') return 'Содержимое не совпадает с выбранной версией. Подписание остановлено.';
  if (error?.code === 'ncalayer_timeout') return 'Время ожидания NCALayer истекло. Подписание не завершено.';
  if (error?.code === 'ncalayer_declined' || error?.code === 'signing_cancelled') return 'Подписание отменено или не подтверждено в NCALayer.';
  if (error?.code === 'ncalayer_disconnected' || error?.code === 'ncalayer_unavailable') return 'Нет соединения с NCALayer. Запустите приложение вручную и повторите действие.';
  if (error?.code === 'ncalayer_invalid_response') return 'NCALayer вернул неподтверждённый ответ. Подпись не передана серверу.';
  if (error?.code === 'invalid_signing_response') return 'Не удалось подтвердить ответ сервера.';
  return 'Не удалось завершить действие. Проверьте соединение и повторите попытку.';
}

// A controller owns the exact previewed version and an in-memory signature.
// Only explicit retrySubmit replays the same intent/signature. No sign retry is
// implicit, and stale contexts cannot initiate the next mutation.
export function createDocumentSigningFlow({ load, prepare, submit, cancel, sign, verifySignature, isCurrent, onChange, verify = verifyIntentBytes, now = Date.now }) {
  let state = initialSigningState(), controller = null, disposed = false, attempt = null;
  const emit = patch => { state = { ...state, ...patch }; onChange(state); };
  const current = request => !disposed && controller === request && !request.signal.aborted && isCurrent();
  const releaseUnsignedIntent = value => {
    if (!value || value.submitted || !isCurrent()) return;
    // A bounded, best-effort cancellation is never sent with another session's
    // authority. Unknown/late intents are left to server-side expiry.
    const cleanup = new AbortController();
    const timer = setTimeout(() => cleanup.abort(), 5000);
    Promise.resolve().then(() => isCurrent() ? cancel(value.intent.id, { signal: cleanup.signal }) : undefined)
      .catch(() => {}).finally(() => clearTimeout(timer));
  };
  const stop = () => {
    controller?.abort(); controller = null;
    const previous = attempt; attempt = null;
    releaseUnsignedIntent(previous);
  };
  const commit = async request => {
    if (!current(request) || !attempt) return;
    const retained = attempt;
    emit({ status: 'submitting', error: null });
    if (!current(request)) return;
    retained.submitted = true;
    try {
      const signature = await submit(retained.intent.id, retained.signature, { signal: request.signal });
      if (!current(request)) return;
      if (signature.version_id !== retained.version.id || signature.sha256.toLowerCase() !== retained.version.sha256.toLowerCase()) throw failure('invalid_signing_response');
      attempt = null;
      emit({ status: 'complete', signature, value: { ...state.value, signature }, error: null });
    } catch (error) {
      if (!current(request)) return;
      // Even a lost/malformed response may follow an accepted save. Keep only
      // this same payload for explicit idempotent recovery; never sign again.
      emit({ status: 'retryable', error });
    }
  };
  return {
    async reload() {
      if (disposed || !isCurrent() || busy(state.status) || state.status === 'retryable') return;
      stop();
      const request = new AbortController(); controller = request;
      emit(initialSigningState());
      try {
        const value = await load({ signal: request.signal });
        if (!current(request)) return;
        const snapshot = { ...value, version: value.version ? Object.freeze({ ...value.version }) : null };
        emit({ status: 'ready', value: snapshot, signature: value.signature, error: null });
      } catch (error) { if (current(request)) emit({ status: 'error', value: null, error }); }
    },
    async start() {
      if (disposed || !isCurrent() || state.status !== 'ready' || !state.value?.signing_allowed || !state.value.version || ['pending_verification', 'verified'].includes(state.signature?.status)) return;
      controller?.abort();
      const request = new AbortController(); controller = request;
      const version = state.value.version;
      emit({ status: 'preparing', error: null });
      if (!current(request)) return;
      try {
        const intent = await prepare(version.id, { signal: request.signal });
        if (!current(request)) return;
        attempt = { intent: { id: intent.id }, version, signature: null, submitted: false };
        if (Date.parse(intent.expires_at) <= now()) throw failure('signing_intent_expired');
        await verify(intent, version);
        if (!current(request)) return;
        if (Date.parse(intent.expires_at) <= now()) throw failure('signing_intent_expired');
        emit({ status: 'signing' });
        if (!current(request)) return;
        const signature = await sign(intent.content_base64, { signal: request.signal });
        if (!current(request)) return;
        if (Date.parse(intent.expires_at) <= now()) throw failure('signing_intent_expired');
        attempt.signature = signature;
        await commit(request);
      } catch (error) {
        if (!current(request)) return;
        const previous = attempt; attempt = null; releaseUnsignedIntent(previous);
        emit({ status: 'ready', error });
      }
    },
    async retrySubmit() {
      if (disposed || !isCurrent() || state.status !== 'retryable' || !attempt?.signature) return;
      controller?.abort(); const request = new AbortController(); controller = request;
      await commit(request);
    },
    async retryVerification() {
      if (disposed || !isCurrent() || !['ready', 'complete'].includes(state.status) || state.signature?.status !== 'pending_verification') return;
      const previous = state.signature, version = state.value.version;
      controller?.abort(); const request = new AbortController(); controller = request;
      emit({ status: 'verifying', error: null });
      if (!current(request)) return;
      try {
        const signature = await verifySignature(previous.id, { signal: request.signal });
        if (!current(request)) return;
        if (signature.id !== previous.id || signature.version_id !== version.id || signature.sha256.toLowerCase() !== version.sha256.toLowerCase()) throw failure('invalid_signing_response');
        emit({ status: 'complete', signature, value: { ...state.value, signature }, error: null });
      } catch (error) { if (current(request)) emit({ status: 'complete', error }); }
    },
    close() { if (disposed) return; stop(); disposed = true; },
    dispose() { if (disposed) return; stop(); disposed = true; },
  };
}
