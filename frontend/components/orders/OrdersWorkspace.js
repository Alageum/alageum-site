"use client";import LocaleElement from "@/components/locale/LocaleElement";

import Link from "@/components/locale/LocaleLink";
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getOrder, getOrders } from '@/lib/api/orders';
import { createOrderRead, initialOrderRead, orderReadError } from '@/lib/orders/read';
import styles from './OrdersWorkspace.module.css';

function useOrderRead(load, scope) {
  const { isAuthScopeCurrent } = useAuth();
  const [state, setState] = useState(initialOrderRead);
  const reader = useRef(null);
  useLayoutEffect(() => {
    const flow = createOrderRead({ load, isCurrent: () => isAuthScopeCurrent(scope), onChange: setState });
    reader.current = flow;
    // Also clear a restored Back/Forward view before paint. Its old successful
    // response or error cannot stand in for a fresh, authorized read.
    flow.reload();
    return () => {flow.dispose();if (reader.current === flow) reader.current = null;};
  }, [load, scope, isAuthScopeCurrent]);
  return { ...state, reload: () => reader.current?.reload() };
}

function ReadState({ state }) {
  if (state.status === 'loading') return <LocaleElement as="p" role="status">Загрузка заказов…</LocaleElement>;
  if (state.status === 'error') return <LocaleElement as="div" className="card">
    <LocaleElement as="p" className="error" role="alert">{orderReadError(state.error)}</LocaleElement>
    <LocaleElement as="button" className="buttonSecondary" type="button" onClick={state.reload}>Повторить</LocaleElement>
  </LocaleElement>;
  return null;
}

export function OrderList({ scope }) {
  const state = useOrderRead(getOrders, scope);
  return <LocaleElement as="section" className={styles.workspace} data-testid="orders-list" aria-label="Заказы организации" aria-busy={state.status === 'loading'}>
    <ReadState state={state} />
    {state.status === 'ready' && (state.value.length ? <LocaleElement as="div" className="grid">
      {state.value.map((item) => <Link className="card" href={`/b2b/orders/${item.id}`} key={item.id} data-testid="order-summary">
        <LocaleElement as="h3">{item.number}</LocaleElement><LocaleElement as="p">{item.amount} {item.currency}</LocaleElement><LocaleElement as="span" className="muted">{item.status}</LocaleElement>
      </Link>)}
    </LocaleElement> : <LocaleElement as="p" className="card muted" role="status">Данных пока нет</LocaleElement>)}
  </LocaleElement>;
}

export function OrderDetail({ id, scope }) {
  const load = useCallback((options) => getOrder(id, options), [id]);
  const state = useOrderRead(load, scope);
  const item = state.value;
  return <LocaleElement as="section" className={styles.workspace} data-testid="order-detail" aria-label="Сведения о заказе" aria-busy={state.status === 'loading'}>
    <Link className="buttonSecondary" href="/b2b/orders">К списку заказов</Link>
    <ReadState state={state} />
    {state.status === 'ready' && <>
      <LocaleElement as="h1">Заказ {item.number}</LocaleElement>
      <LocaleElement as="div" className="card"><LocaleElement as="p">Статус: {item.status}</LocaleElement><LocaleElement as="p">Сумма: {item.amount} {item.currency}</LocaleElement></LocaleElement>
      <LocaleElement as="h2">Позиции</LocaleElement>
      {item.items.length ? item.items.map((line) => <LocaleElement as="div" className="card" key={line.id} data-testid="order-item">{line.description} — {line.quantity}</LocaleElement>) : <LocaleElement as="p" className="card muted" role="status">В заказе пока нет позиций.</LocaleElement>}
    </>}
  </LocaleElement>;
}

export default function OrdersAccess({ id }) {
  const { loading, authScope, hasPermission } = useAuth();
  if (loading) return <LocaleElement as="p" role="status">Проверка доступа…</LocaleElement>;
  if (!hasPermission('order.read')) return <LocaleElement as="section" className="card"><LocaleElement as="p" role="alert">У вашей учётной записи нет доступа к заказам.</LocaleElement></LocaleElement>;
  return id === undefined ? <OrderList key={authScope} scope={authScope} /> : <OrderDetail key={`${authScope}:${id}`} id={id} scope={authScope} />;
}
