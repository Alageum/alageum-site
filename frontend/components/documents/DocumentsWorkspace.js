"use client";

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DocumentUpload, DocumentDownload } from './DocumentFileActions';
import { fileLabels } from '@/lib/documents/fileLabels';
import { useAuth } from '@/components/AuthProvider';
import { getDocuments } from '@/lib/api/documents';
import { createDocumentRead, initialDocumentRead, documentReadError } from '@/lib/documents/read';
import styles from './DocumentsWorkspace.module.css';
import QuoteSigningInbox from '@/components/quotes/QuoteSigningInbox';
import DocumentSigningPanel from './DocumentSigningPanel';

const signingEnabled = process.env.NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED === '1';

function DocumentList({ scope }) {
  const { isAuthScopeCurrent, hasPermission } = useAuth();
  const pathname = usePathname();
  const labels = fileLabels[pathname?.split('/')[1]] || fileLabels.ru;
  const [signingDocument, setSigningDocument] = useState(null);
  const signingTrigger = useRef(null);
  const closeSigning = useCallback(() => { setSigningDocument(null); signingTrigger.current?.focus(); }, []);
  const [state, setState] = useState(initialDocumentRead);
  const reader = useRef(null);
  useLayoutEffect(() => {
    const flow = createDocumentRead({ load: getDocuments, isCurrent: () => isAuthScopeCurrent(scope), onChange: setState });
    reader.current = flow;
    // Clear a restored Back/Forward view before paint and recheck its scope.
    flow.reload();
    return () => { flow.dispose(); if (reader.current === flow) reader.current = null; };
  }, [scope, isAuthScopeCurrent]);

  return <section className={styles.workspace} data-testid="documents-list" aria-label="Документы организации" aria-busy={state.status === 'loading'}>
    <QuoteSigningInbox key={scope} scope={scope} />
    <button className="buttonSecondary" type="button" disabled={state.status === 'loading'} onClick={() => reader.current?.reload()}>{labels.refresh}</button>
    {hasPermission('document.create') && <DocumentUpload scope={scope} labels={labels} onSaved={() => reader.current?.reload()} />}
    {state.status === 'loading' && <p role="status">Загрузка документов…</p>}
    {state.status === 'error' && <div className="card">
      <p className="error" role="alert">{documentReadError(state.error)}</p>
      <button className="buttonSecondary" type="button" onClick={() => reader.current?.reload()}>Повторить</button>
    </div>}
    {state.status === 'ready' && (state.value.length ? <div className="grid">
      {state.value.map(item => <div className="card" key={item.id} data-testid="document-summary">
        <h3>{item.title}</h3><p>{item.number || "Без номера"}</p><span className="muted">{item.type_code}</span>
        <DocumentDownload item={item} scope={scope} labels={labels} />
        {signingEnabled && hasPermission('document.sign') && <div className={styles.documentActions}><button className="buttonSecondary" type="button" onClick={event => { signingTrigger.current = event.currentTarget; setSigningDocument(item); }}>Подпись ЭЦП</button></div>}
      </div>)}
    </div> : <p className="card muted" role="status">Данных пока нет</p>)}
    {signingEnabled && hasPermission('document.sign') && signingDocument && <DocumentSigningPanel key={signingDocument.id} document={signingDocument} scope={scope} onClose={closeSigning} />}
  </section>;
}

export default function DocumentsAccess() {
  const { loading, authScope, hasPermission } = useAuth();
  if (loading) return <p role="status">Проверка доступа…</p>;
  if (!hasPermission('document.read')) return <section className="card"><p role="alert">У вашей учётной записи нет доступа к документам.</p></section>;
  return <DocumentList key={authScope} scope={authScope} />;
}
