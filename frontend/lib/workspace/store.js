'use client';

import { useMemo, useSyncExternalStore } from 'react';
import { applyInquiryPatch, decodeInquiries, normalizeInquiry, WORKSPACE_LIMITS } from './domain.js';

export const WORKSPACE_STORAGE_KEY = 'alageum.workspace.demo.v1';
const EVENT = 'alageum:workspace';
const SERVER_SNAPSHOT = '0|[]';
let memory = '[]';
let unavailable = false;

function snapshot() {
  if (typeof window === 'undefined') return SERVER_SNAPSHOT;
  try { memory = window.localStorage.getItem(WORKSPACE_STORAGE_KEY) || '[]'; unavailable = false; }
  catch { unavailable = true; }
  return `${unavailable ? '1' : '0'}|${memory}`;
}
function current() { return decodeInquiries(snapshot().slice(2)); }
function uniqueId() { return globalThis.crypto?.randomUUID?.() || `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
function write(inquiries) {
  if (typeof window === 'undefined') throw new Error('Демо-кабинет доступен только в браузере.');
  const serialized = JSON.stringify(inquiries);
  try { window.localStorage.setItem(WORKSPACE_STORAGE_KEY, serialized); memory = serialized; unavailable = false; }
  catch {
    unavailable = true;
    window.dispatchEvent(new Event(EVENT));
    throw new Error('Браузер не разрешил локальное сохранение или хранилище заполнено. Изменения не сохранены. Проверьте настройки браузера и повторите.');
  }
  window.dispatchEvent(new Event(EVENT));
}
function editable() {
  const { inquiries, corrupt } = current();
  if (corrupt) throw new Error('Локальные данные повреждены. Откройте демо-кабинет и сбросьте их перед сохранением.');
  return inquiries;
}

export function loadInquiries() { return current().inquiries; }
export function saveInquiry(input) {
  const inquiries = editable();
  const now = new Date().toISOString();
  const id = typeof input?.id === 'string' && /^[\w-]{1,100}$/.test(input.id) ? input.id : uniqueId();
  const existing = inquiries.find((record) => record.id === id);
  if (existing) { updateInquiry(id, input); return id; }
  if (inquiries.length >= WORKSPACE_LIMITS.records) throw new Error(`Можно сохранить до ${WORKSPACE_LIMITS.records} демо-запросов. Удалите ненужный запрос и повторите.`);
  const record = normalizeInquiry(input, { now, id });
  if (!record) throw new Error('Не удалось прочитать данные запроса.');
  record.id = id;
  record.history = [{ id: uniqueId(), text: 'Черновик сохранён в этом браузере', status: record.status, role: 'customer', createdAt: now }];
  write([record, ...inquiries]);
  return id;
}
export function updateInquiry(id, patch) {
  const inquiries = editable();
  const existing = inquiries.find((record) => record.id === id);
  if (!existing) throw new Error('Запрос не найден в этом браузере. Возможно, он был удалён в другой вкладке.');
  const next = applyInquiryPatch(existing, patch, { now: new Date().toISOString(), eventId: uniqueId() });
  if (next !== existing) write(inquiries.map((record) => record.id === id ? next : record));
  return next;
}
export function removeInquiry(id) { write(editable().filter((record) => record.id !== id)); }
export function clearInquiries() { write([]); }
export function subscribeInquiries(listener) {
  const onStorage = (event) => { if (event.key === WORKSPACE_STORAGE_KEY || event.key === null) listener(); };
  window.addEventListener('storage', onStorage);
  window.addEventListener(EVENT, listener);
  return () => { window.removeEventListener('storage', onStorage); window.removeEventListener(EVENT, listener); };
}
export function useInquiries() {
  const raw = useSyncExternalStore(subscribeInquiries, snapshot, () => SERVER_SNAPSHOT);
  return useMemo(() => ({ ...decodeInquiries(raw.slice(2)), storageUnavailable: raw.startsWith('1|') }), [raw]);
}
