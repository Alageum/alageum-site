'use client';
import { useMemo, useSyncExternalStore } from 'react';
import { canReuseAttempt, decodeDraft, quotePayload, selectionFingerprint } from './model.js';
const PREFIX = 'alageum.quote.draft.v1:';
const EVENT = 'alageum:quote-draft';
const memory = new Map();
function snapshot(scope) {
  if (!scope || typeof window === 'undefined') return '0|{}';
  const key = PREFIX + scope;
  try { const raw = window.sessionStorage.getItem(key) || '{}'; memory.set(key, raw); return `0|${raw}`; }
  catch { return `1|${memory.get(key) || '{}'}`; }
}
function read(scope) {
  const raw = snapshot(scope), draft = decodeDraft(raw.slice(2));
  if (raw.startsWith('1|')) throw new Error('Браузер не разрешил сохранение черновика. Разрешите хранилище этой вкладки перед отправкой.');
  if (draft.corrupt) throw new Error('Сохранённый черновик повреждён. Проверьте мои запросы, затем сбросьте черновик.');
  return draft;
}
function write(scope, draft) {
  if (!scope) throw new Error('Войдите, чтобы сохранить запрос.');
  const key = PREFIX + scope, raw = JSON.stringify({ version: 1, comment: draft.comment, attempt: draft.attempt });
  try { window.sessionStorage.setItem(key, raw); memory.set(key, raw); }
  catch { throw new Error('Не удалось сохранить черновик в этой вкладке. Отправка не начата. Проверьте настройки хранилища браузера.'); }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(callback) {
  window.addEventListener(EVENT, callback); window.addEventListener('storage', callback);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener('storage', callback); };
}
export function useQuoteDraft(scope) {
  const raw = useSyncExternalStore(subscribe, () => snapshot(scope), () => '0|{}');
  return useMemo(() => ({ ...decodeDraft(raw.slice(2)), storageUnavailable: raw.startsWith('1|') }), [raw]);
}
export function saveQuoteComment(scope, comment) {
  const draft = read(scope);
  write(scope, { comment, attempt: draft.attempt });
}
export function prepareQuoteAttempt(scope, items) {
  const draft = read(scope);
  if (canReuseAttempt(draft.attempt, items, draft.comment)) return draft.attempt;
  if (!globalThis.crypto?.randomUUID) throw new Error('Для безопасной отправки откройте сайт по HTTPS.');
  const attempt = { key: crypto.randomUUID(), selection: selectionFingerprint(items), comment: draft.comment, payload: quotePayload(items, draft.comment), quoteId: null };
  write(scope, { ...draft, attempt }); // Durably store BEFORE making the network call.
  return attempt;
}
export function completeQuoteAttempt(scope, key, quoteId) {
  const draft = read(scope);
  if (draft.attempt?.key === key) write(scope, { ...draft, attempt: { ...draft.attempt, quoteId } });
}
export function resetQuoteDraft(scope) { write(scope, { comment: '', attempt: null }); }
