"use client";import LocaleElement from "@/components/locale/LocaleElement";

import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getInvoices } from '@/lib/api/finance';
import { createInvoiceRead, initialInvoiceRead, invoiceReadError } from '@/lib/finance/read';
import styles from './InvoicesWorkspace.module.css';

function InvoiceList({ scope }) {
  const { isAuthScopeCurrent } = useAuth();
  const [state, setState] = useState(initialInvoiceRead);
  const reader = useRef(null);
  useLayoutEffect(() => {
    const flow = createInvoiceRead({ load: getInvoices, isCurrent: () => isAuthScopeCurrent(scope), onChange: setState });
    reader.current = flow;
    // Clear a restored Back/Forward view before paint and recheck its scope.
    flow.reload();
    return () => {flow.dispose();if (reader.current === flow) reader.current = null;};
  }, [scope, isAuthScopeCurrent]);

  return <LocaleElement as="section" className={styles.workspace} data-testid="invoices-list" aria-label="Счета организации" aria-busy={state.status === 'loading'}>
    {state.status === 'loading' && <LocaleElement as="p" role="status">Загрузка счетов…</LocaleElement>}
    {state.status === 'error' && <LocaleElement as="div" className="card">
      <LocaleElement as="p" className="error" role="alert">{invoiceReadError(state.error)}</LocaleElement>
      <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => reader.current?.reload()}>Повторить</LocaleElement>
    </LocaleElement>}
    {state.status === 'ready' && (state.value.length ? <LocaleElement as="div" className="grid">
      {state.value.map((item) => <LocaleElement as="div" className="card" key={item.id} data-testid="invoice-summary">
        <LocaleElement as="h3">{item.number}</LocaleElement><LocaleElement as="p">{item.amount} {item.currency}</LocaleElement><LocaleElement as="span" className="muted">{item.status}</LocaleElement>
      </LocaleElement>)}
    </LocaleElement> : <LocaleElement as="p" className="card muted" role="status">Данных пока нет</LocaleElement>)}
  </LocaleElement>;
}

export default function InvoicesAccess() {
  const { loading, authScope, hasPermission } = useAuth();
  if (loading) return <LocaleElement as="p" role="status">Проверка доступа…</LocaleElement>;
  if (!hasPermission('finance.read')) return <LocaleElement as="section" className="card"><LocaleElement as="p" role="alert">У вашей учётной записи нет доступа к счетам.</LocaleElement></LocaleElement>;
  return <InvoiceList key={authScope} scope={authScope} />;
}
