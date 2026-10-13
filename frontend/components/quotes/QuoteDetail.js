'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Link from "@/components/locale/LocaleLink";
import { useEffect, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getQuote } from '@/lib/api/quotes';
import { catalogPrice } from '@/lib/catalog/admin';
import { hasQuoteSnapshot, quoteDate, quoteError, quoteScope, quoteStatus, quoteTitle, UUID } from '@/lib/quotes/model';
import QuoteAccess from './QuoteAccess';
function OwnQuote({ id }) {
  const { profile } = useAuth(),scope = quoteScope(profile);
  const [retry, setRetry] = useState(0),[state, setState] = useState(null),key = `${scope}:${id}:${retry}`;
  useEffect(() => {
    let active = true;
    getQuote(id).then((data) => {if (active) setState({ key, data });}).catch((error) => {if (active) setState({ key, error });});
    return () => {active = false;};
  }, [id, key]);
  if (state?.key !== key) return <LocaleElement as="p" role="status">Загрузка сохранённого запроса…</LocaleElement>;
  if (state.error) return <LocaleElement as="div" className="card"><LocaleElement as="h1">{state.error.status === 404 ? 'Запрос недоступен' : 'Не удалось открыть запрос'}</LocaleElement><LocaleElement as="p" role="alert" className="error">{quoteError(state.error)}</LocaleElement>{state.error.status !== 404 && <LocaleElement as="button" className="buttonSecondary" onClick={() => setRetry((value) => value + 1)}>Повторить</LocaleElement>}</LocaleElement>;
  const quote = state.data;
  const allSnapshots = quote.items.length > 0 && quote.items.every(hasQuoteSnapshot);
  return <><LocaleElement as="div" className="quote-page-heading"><LocaleElement as="h1">Запрос {quote.id.slice(0, 8)}</LocaleElement><LocaleElement as="span" className="quote-status">{quoteStatus(quote.status)}</LocaleElement><Link className="buttonSecondary" href={`/b2b/quotes/${quote.id}/print`}>Версия для печати</Link></LocaleElement><LocaleElement as="p" className="quote-id">ID: {quote.id}</LocaleElement><LocaleElement as="p">{quoteDate(quote.created_at)} · Позиций: {quote.item_count}</LocaleElement><LocaleElement as="p" className="card" role="status">Запрос сохранён в базе. Отправка менеджеру и CRM пока не подключена. Это не заказ и не подтверждение наличия.</LocaleElement>
    {quote.comment && <LocaleElement as="section" className="card"><LocaleElement as="h2">Ваше сообщение</LocaleElement><LocaleElement as="p" className="quote-comment">{quote.comment}</LocaleElement></LocaleElement>}
    <LocaleElement as="section"><LocaleElement as="h2">{allSnapshots ? 'Состав на момент сохранения' : 'Состав запроса'}</LocaleElement><LocaleElement as="p" className="muted">{allSnapshots ? 'Названия, цены и версия товара зафиксированы в запросе. Изменения каталога не обновляют эту копию. Цены справочные.' : 'В этом запросе есть позиции без исторической копии товара. Для них показаны только сохранённые данные запроса. Актуальный каталог не подставляется вместо отсутствующей копии.'}</LocaleElement><LocaleElement as="div" className="quote-list">{quote.items.map((item) => {
          const hasSnapshot = hasQuoteSnapshot(item);
          return <LocaleElement as="article" className="card" key={item.id}><LocaleElement as="h3">{quoteTitle(item)}</LocaleElement>{hasSnapshot ? <LocaleElement as="p">Артикул: {item.product_snapshot.sku || '—'}</LocaleElement> : <LocaleElement as="p" className="muted">Для этой позиции историческая копия товара не сохранена. Название, артикул, цена и версия на дату запроса недоступны.</LocaleElement>}<LocaleElement as="dl" className="quote-item-facts"><LocaleElement as="div"><LocaleElement as="dt">Количество</LocaleElement><LocaleElement as="dd">{item.quantity}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Цена из каталога</LocaleElement><LocaleElement as="dd">{hasSnapshot ? catalogPrice(item.product_snapshot) : 'Не сохранена'}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Версия товара</LocaleElement><LocaleElement as="dd">{hasSnapshot ? item.product_snapshot.version ?? '—' : 'Не сохранена'}</LocaleElement></LocaleElement></LocaleElement></LocaleElement>;
        })}</LocaleElement></LocaleElement>
  </>;
}
export default function QuoteDetail({ id }) {
  return <LocaleElement as="div" className="quotes-page"><Link className="quote-back" href="/b2b/quotes">← Мои запросы КП</Link>{UUID.test(id) ? <QuoteAccess next={`/b2b/quotes/${id}`}><OwnQuote id={id} /></QuoteAccess> : <LocaleElement as="div" className="card"><LocaleElement as="h1">Запрос недоступен</LocaleElement><LocaleElement as="p">Проверьте адрес или выберите запрос в своём списке.</LocaleElement></LocaleElement>}</LocaleElement>;
}
