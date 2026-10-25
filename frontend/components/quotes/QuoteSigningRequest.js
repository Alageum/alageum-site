'use client';
import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { validateSigningRequest } from '@/lib/quotes/signingRequest';
import LocaleElement from '@/components/locale/LocaleElement';

// This button only submits a prepared packet. A request is never an ЭЦП.
export default function QuoteSigningRequest({ quoteId, scope }) {
  const [state, setState] = useState(null), [busy, setBusy] = useState(false);
  const key = `${scope}:${quoteId}`;
  useEffect(() => {
    const controller = new AbortController();
    apiFetch(`/quotes/${encodeURIComponent(quoteId)}/signature-request`, { signal: controller.signal })
      .then(value => validateSigningRequest(value, quoteId))
      .then(data => { if (!controller.signal.aborted) setState({ key, data }); })
      .catch(() => { if (!controller.signal.aborted) setState({ key, error: true }); });
    return () => controller.abort();
  }, [key, quoteId]);
  async function request() {
    setBusy(true);
    try {
      const data = await apiFetch(`/quotes/${encodeURIComponent(quoteId)}/signature-request`, { method: 'POST', body: '{}' }, false);
      setState({ key, data: validateSigningRequest(data, quoteId) });
    } catch { setState({ key, error: true }); }
    finally { setBusy(false); }
  }
  const data = state?.key === key ? state.data : null;
  const requested = data?.status === 'requested';
  return <LocaleElement as="section" className="card" aria-label="Подписание КП">
    <LocaleElement as="h2">КП на подписание менеджеру</LocaleElement>
    <LocaleElement as="p" role="status">{state?.key === key && state.error ? 'Не удалось проверить подготовку КП. Подписание не подтверждено.' : !data ? 'Проверяем подготовку КП…' : requested ? 'Запрос на подписание сохранён в кабинете. Это не подпись и не заказ. Внешнее уведомление менеджеру не подключено.' : data.status === 'ready' ? 'Итоговый список связан с неизменяемым PDF. Можно передать запрос назначенному менеджеру в кабинете.' : 'Передача на подписание пока недоступна: требуется настройка компании-подписанта, назначенного менеджера и неизменяемого PDF КП.'}</LocaleElement>
    <LocaleElement as="p" className="muted">Требуется полная ЭЦП с проверкой на сервере. Кнопка отправки не подписывает документ. Цены каталога справочные; коммерческие условия не добавляются автоматически.</LocaleElement>
    {data?.request_allowed === true && data.status === 'ready' && <LocaleElement as="button" className="buttonPrimary" disabled={busy} onClick={request}>{busy ? 'Передаём запрос…' : 'Передать КП менеджеру на ЭЦП'}</LocaleElement>}
  </LocaleElement>;
}
