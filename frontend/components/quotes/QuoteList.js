'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getQuotes } from '@/lib/api/quotes';
import { quoteDate, quoteError, quoteScope, quoteStatus } from '@/lib/quotes/model';
import QuoteAccess from './QuoteAccess';
function OwnQuotes() {
  const { profile } = useAuth(),scope = quoteScope(profile);
  const [page, setPage] = useState(1),[retry, setRetry] = useState(0),[state, setState] = useState(null);
  const key = `${scope}:${page}:${retry}`;
  useEffect(() => {
    let active = true;
    getQuotes(page).then((data) => {if (active) setState({ key, data });}).catch((error) => {if (active) setState({ key, error });});
    return () => {active = false;};
  }, [page, key]);
  if (state?.key !== key) return <LocaleElement as="p" role="status">Загрузка ваших запросов…</LocaleElement>;
  if (state.error) return <LocaleElement as="div" className="card"><LocaleElement as="p" className="error" role="alert">{quoteError(state.error)}</LocaleElement><LocaleElement as="button" className="buttonSecondary" onClick={() => setRetry((value) => value + 1)}>Повторить</LocaleElement></LocaleElement>;
  return <>
    {!state.data.items.length ? <LocaleElement as="div" className="card"><LocaleElement as="p">У вас пока нет сохранённых запросов.</LocaleElement><Link href="/catalog?source=api">Выбрать оборудование →</Link></LocaleElement> : <LocaleElement as="div" className="quote-list">{state.data.items.map((item) => <LocaleElement as="article" className="card" key={item.id}><LocaleElement as="div" className="quote-card-heading"><LocaleElement as="h2"><Link href={`/b2b/quotes/${item.id}`}>Запрос {item.id.slice(0, 8)} →</Link></LocaleElement><LocaleElement as="span" className="quote-status">{quoteStatus(item.status)}</LocaleElement></LocaleElement><LocaleElement as="p">{quoteDate(item.created_at)} · Позиций: {item.item_count}</LocaleElement>{item.comment && <LocaleElement as="p" className="quote-comment">{item.comment}</LocaleElement>}</LocaleElement>)}</LocaleElement>}
    {state.data.total > 20 && <LocaleElement as="nav" className="catalog-pagination" aria-label="Страницы моих запросов"><LocaleElement as="button" className="catalog-button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Назад</LocaleElement><LocaleElement as="span">Страница {page} из {Math.ceil(state.data.total / 20)}</LocaleElement><LocaleElement as="button" className="catalog-button" disabled={page * 20 >= state.data.total} onClick={() => setPage((value) => value + 1)}>Далее →</LocaleElement></LocaleElement>}
  </>;
}
export default function QuoteList() {
  return <LocaleElement as="div" className="quotes-page"><LocaleElement as="div" className="quote-page-heading"><LocaleElement as="h1">Мои запросы КП</LocaleElement><Link className="button" href="/inquiry?source=api">Новый запрос</Link></LocaleElement><LocaleElement as="p" className="muted">Запросы вашей учётной записи в текущей организации. Статус «Сохранён» подтверждает запись в базе. Работа менеджера и отправка в CRM пока не подключены.</LocaleElement><QuoteAccess><OwnQuotes /></QuoteAccess></LocaleElement>;
}
