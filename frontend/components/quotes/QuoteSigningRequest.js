'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch, downloadQuoteSigningPdf } from '@/lib/api/client';
import { validateSigningRequest } from '@/lib/quotes/signingRequest';
import LocaleElement from '@/components/locale/LocaleElement';

export default function QuoteSigningRequest({ quoteId, scope }) {
  const { authScope, isAuthScopeCurrent } = useAuth();
  const [state, setState] = useState(null), [busy, setBusy] = useState(false), [retry, setRetry] = useState(0);
  const operation = useRef(null);
  const key = `${scope}:${quoteId}:${retry}`;
  useEffect(() => {
    const controller = new AbortController(); operation.current = controller;
    apiFetch(`/quotes/${encodeURIComponent(quoteId)}/signature-request`, { signal: controller.signal })
      .then(value => validateSigningRequest(value, quoteId))
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => { controller.abort(); operation.current?.abort(); };
  }, [key, quoteId]);
  async function mutate(prepare) {
    if (busy || !isAuthScopeCurrent(authScope)) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true);
    try {
      const data = await apiFetch(`/quotes/${quoteId}/signature-request${prepare ? '/prepare' : ''}`, { method: 'POST', body: '{}', signal: controller.signal }, false);
      if (!controller.signal.aborted && isAuthScopeCurrent(authScope)) setState({ key, data: validateSigningRequest(data, quoteId) });
    } catch { if (!controller.signal.aborted && isAuthScopeCurrent(authScope)) setState({ key, error: true }); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const data = state?.key === key ? state.data : null;
  async function download() {
    if (busy || !data?.pdf_sha256 || !isAuthScopeCurrent(authScope)) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true);
    try {
      const result = await downloadQuoteSigningPdf(quoteId, { signal: controller.signal });
      const bytes = await result.blob.arrayBuffer();
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
      if (result.contentType !== 'application/pdf' || hash !== data.pdf_sha256) throw new Error('PDF hash mismatch');
      if (controller.signal.aborted || !isAuthScopeCurrent(authScope)) return;
      const url = URL.createObjectURL(result.blob), link = document.createElement('a');
      link.href = url; link.download = `quote-${quoteId}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { if (!controller.signal.aborted && isAuthScopeCurrent(authScope)) setState({ key, error: true }); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  }
  const messages = {
    configuration_required: 'Передача пока недоступна: требуется настройка компании-подписанта, назначенного менеджера и защищённого хранения PDF.',
    preparation_available: 'Сформируйте неизменяемый PDF из итогового списка. Затем проверьте его и передайте менеджеру на полную ЭЦП.',
    ready: 'PDF сформирован из сохранённого списка. Скачайте и проверьте его перед передачей менеджеру.',
    requested: 'КП передано назначенному менеджеру в кабинете. Это не заказ. Внешнее уведомление не подключено.',
  };
  const signatureLabels = { not_verified: 'Проверенной ЭЦП пока нет.', pending_verification: 'ЭЦП ожидает проверки сервером.', verified: 'ЭЦП проверена сервером.', rejected: 'ЭЦП отклонена сервером.' };
  return <LocaleElement as="section" className="card" aria-label="Подписание КП">
    <LocaleElement as="h2">КП на подписание менеджеру</LocaleElement>
    <LocaleElement as="p" role="status">{state?.key === key && state.error ? 'Не удалось проверить подготовку КП. Обновите статус перед повторной отправкой.' : !data ? 'Проверяем подготовку КП…' : messages[data.status]}</LocaleElement>
    {data && <LocaleElement as="p">{signatureLabels[data.signature_status]}</LocaleElement>}
    <LocaleElement as="p" className="muted">Требуется полная ЭЦП с проверкой на сервере. Кнопка отправки не подписывает документ. Цены каталога справочные; коммерческие условия не добавляются автоматически.</LocaleElement>
    {data?.prepare_allowed && <LocaleElement as="button" className="buttonPrimary" disabled={busy} onClick={() => mutate(true)}>Сформировать PDF итогового списка</LocaleElement>}
    {data?.pdf_sha256 && <LocaleElement as="button" className="buttonSecondary" disabled={busy} onClick={download}>Скачать неизменяемый PDF</LocaleElement>}
    {data?.request_allowed && <LocaleElement as="button" className="buttonPrimary" disabled={busy} onClick={() => mutate(false)}>Передать КП менеджеру на ЭЦП</LocaleElement>}
    <LocaleElement as="button" className="buttonSecondary" disabled={busy} onClick={() => setRetry(value => value + 1)}>Обновить статус</LocaleElement>
  </LocaleElement>;
}
