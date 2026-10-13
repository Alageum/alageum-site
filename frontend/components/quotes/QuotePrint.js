'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { useAuth } from '@/components/AuthProvider';
import { me } from '@/lib/api/auth';
import { getQuote } from '@/lib/api/quotes';
import { subscribeSession } from '@/lib/api/sessionTransport';
import { UUID } from '@/lib/quotes/model';
import { QUOTE_PRINT_FALLBACK, QUOTE_PRINT_TITLE } from '@/lib/quotes/print';
import { createQuotePrintSession } from '@/lib/quotes/printSession';
import QuoteAccess from './QuoteAccess';
import QuotePrintDocument from './QuotePrintDocument';
const subscribeMounted = () => () => {};

function OwnQuotePrint({ id }) {
  const { profile, authScope, isAuthScopeCurrent } = useAuth();
  const [state, setState] = useState({ status: 'loading', data: null, error: '', message: '' });
  const paper = useRef(null),session = useRef(null);
  const mounted = useSyncExternalStore(subscribeMounted, () => true, () => false);
  const userId = profile.user.id,organizationId = profile.organization.id;
  useEffect(() => {
    const printer = createQuotePrintSession({
      id, userId, organizationId, readProfile: me, readQuote: getQuote,
      isCurrent: () => isAuthScopeCurrent(authScope),
      onChange: (next, immediate) => immediate ? flushSync(() => setState(next)) : setState(next),
      showPaper: () => paper.current?.setAttribute('data-authorized', 'true'),
      hidePaper: () => paper.current?.removeAttribute('data-authorized'),
      print: () => window.print()
    });
    session.current = printer;
    const before = () => printer.beforePrint(),after = () => printer.afterPrint();
    const leave = () => printer.clear();
    const restore = (event) => {if (event.persisted) {printer.clear();printer.load();}};
    const unsubscribe = subscribeSession(() => printer.sessionChanged());
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', restore);
    printer.load();
    return () => {
      printer.dispose();
      unsubscribe();
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      window.removeEventListener('pagehide', leave);
      window.removeEventListener('pageshow', restore);
      if (session.current === printer) session.current = null;
    };
  }, [id, userId, organizationId, authScope, isAuthScopeCurrent]);
  const pending = state.status === 'loading' || state.status === 'printing';
  return <>
    <LocaleElement as="div" className="quote-print-controls"><Link className="quote-back" href={`/b2b/quotes/${id}`} onClick={() => session.current?.clear()}>← Закрыть просмотр</Link><LocaleElement as="button" type="button" className="button" disabled={pending} onClick={() => session.current?.print()}>Печать</LocaleElement></LocaleElement>
    <LocaleElement as="p" className="quote-print-help">Печать средствами браузера. Перед каждым открытием окна печати доступ и данные проверяются заново. Для печати используйте кнопку «Печать» на этой странице.</LocaleElement>
    {!state.data && !state.error && <LocaleElement as="h1">{QUOTE_PRINT_TITLE}</LocaleElement>}
    {state.status === 'loading' && <LocaleElement as="p" role="status">Проверка доступа и загрузка сохранённого запроса…</LocaleElement>}
    {state.error && <LocaleElement as="div" className="card"><LocaleElement as="h1">{QUOTE_PRINT_TITLE}</LocaleElement><LocaleElement as="p" role="alert" className="error">{state.error}</LocaleElement><LocaleElement as="button" type="button" className="buttonSecondary" onClick={() => session.current?.load()}>Повторить проверку</LocaleElement></LocaleElement>}
    {state.message && <LocaleElement as="p" role="status">{state.message}</LocaleElement>}
    {state.data && <QuotePrintDocument quote={state.data} />}
    {mounted && createPortal(<LocaleElement as="div" ref={paper} data-quote-print-paper=""><LocaleElement as="p" data-quote-print-fallback="">{QUOTE_PRINT_FALLBACK}</LocaleElement>{state.data && <QuotePrintDocument quote={state.data} paper />}</LocaleElement>, document.body)}
  </>;
}
export default function QuotePrint({ id }) {
  const { authScope } = useAuth();
  const normalizedId = typeof id === 'string' ? id.toLowerCase() : '';
  return <LocaleElement as="div" className="quotes-page quote-print-page">{UUID.test(normalizedId) ? <QuoteAccess next={`/b2b/quotes/${normalizedId}/print`}><OwnQuotePrint key={`${authScope}:${normalizedId}`} id={normalizedId} /></QuoteAccess> : <LocaleElement as="div" className="card"><LocaleElement as="h1">Запрос недоступен</LocaleElement><LocaleElement as="p">Проверьте адрес или выберите запрос в своём списке.</LocaleElement><Link href="/b2b/quotes">Мои запросы КП</Link></LocaleElement>}</LocaleElement>;
}
