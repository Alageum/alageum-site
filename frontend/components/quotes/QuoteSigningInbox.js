'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { apiFetch } from '@/lib/api/client';
import DocumentSigningPanel from '@/components/documents/DocumentSigningPanel';
import LocaleElement from '@/components/locale/LocaleElement';
const signingEnabled = process.env.NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED === '1';
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
function validate(value, page) {
  if (!value || value.page !== page || value.page_size !== 20 || !Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.items) || value.items.length > 20 || !value.items.every(item =>
    uuid(item.id) && uuid(item.quote_id) && uuid(item.document_id) && typeof item.title === 'string' && /^[0-9a-f]{64}$/.test(item.pdf_sha256) &&
    !Number.isNaN(Date.parse(item.requested_at)) && ['not_verified', 'pending_verification', 'verified', 'rejected'].includes(item.signature_status))) throw new Error('Invalid signing inbox');
  return value;
}
export default function QuoteSigningInbox({ scope }) {
  const { hasPermission, isAuthScopeCurrent } = useAuth();
  const [page, setPage] = useState(1), [retry, setRetry] = useState(0), [state, setState] = useState(null), [selected, setSelected] = useState(null);
  const allowed = hasPermission('document.read') && hasPermission('document.sign'), key = `${scope}:${page}:${retry}`;
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    apiFetch(`/quote-signature-requests?page=${page}&page_size=20`, { signal: controller.signal }).then(value => validate(value, page))
      .then(value => { if (!controller.signal.aborted && isAuthScopeCurrent(scope)) setState({ key, value }); })
      .catch(() => { if (!controller.signal.aborted && isAuthScopeCurrent(scope)) setState({ key, error: true }); });
    return () => controller.abort();
  }, [allowed, scope, page, retry, key, isAuthScopeCurrent]);
  if (!allowed) return null;
  const data = state?.key === key ? state.value : null;
  const labels = { not_verified: 'Ожидает ЭЦП', pending_verification: 'Проверка ЭЦП', verified: 'ЭЦП проверена', rejected: 'ЭЦП отклонена' };
  return <LocaleElement as="section" className="card" aria-label="КП на мою подпись">
    <LocaleElement as="h2">КП на мою подпись</LocaleElement>
    <LocaleElement as="p" className="muted">Только итоговые списки, переданные вам как назначенному менеджеру компании. Подпись выполняется через ЭЦП, не кнопкой согласования.</LocaleElement>
    {state?.key === key && state.error ? <LocaleElement as="p" role="alert">Не удалось загрузить назначенные КП.</LocaleElement> : !data ? <LocaleElement as="p" role="status">Загрузка…</LocaleElement> : !data.items.length ? <LocaleElement as="p">Назначенных КП нет.</LocaleElement> : data.items.map(item => <LocaleElement as="article" className="card" key={item.id}>
      <LocaleElement as="h3">{item.title}</LocaleElement><LocaleElement as="p">{labels[item.signature_status]}</LocaleElement>
      {signingEnabled ? <LocaleElement as="button" className="buttonSecondary" onClick={() => setSelected({ ...item, scope })}>Открыть полную ЭЦП</LocaleElement> : <LocaleElement as="p">Подписание отключено до настройки серверной проверки ЭЦП.</LocaleElement>}
    </LocaleElement>)}
    <LocaleElement as="button" className="buttonSecondary" onClick={() => setRetry(value => value + 1)}>Обновить входящие</LocaleElement>
    <LocaleElement as="button" className="buttonSecondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}>Назад</LocaleElement>
    <LocaleElement as="button" className="buttonSecondary" disabled={!data || page * 20 >= data.total} onClick={() => setPage(value => value + 1)}>Далее</LocaleElement>
    {signingEnabled && selected?.scope === scope && <DocumentSigningPanel document={{ id: selected.document_id, title: selected.title }} scope={scope} onClose={() => { setSelected(null); setRetry(value => value + 1); }} />}
  </LocaleElement>;
}
