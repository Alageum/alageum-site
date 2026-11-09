"use client";

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import { useAuth } from '@/components/AuthProvider';
import { getDocuments } from '@/lib/api/documents';
import { createDocumentRead, initialDocumentRead, documentReadError } from '@/lib/documents/read';
import styles from './DocumentsWorkspace.module.css';
import DocumentSigningPanel from './DocumentSigningPanel';

const signingEnabled = process.env.NEXT_PUBLIC_DOCUMENT_SIGNING_ENABLED === '1';

function DocumentList({ scope }) {
  const { isAuthScopeCurrent, hasPermission } = useAuth();
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

  return <E as="section" className={styles.workspace} data-testid="documents-list" aria-label="Документы организации" aria-busy={state.status === 'loading'}>
    {state.status === 'loading' && <E as="p" role="status">Загрузка документов…</E>}
    {state.status === 'error' && <div className="card">
      <E as="p" className="error" role="alert">{documentReadError(state.error)}</E>
      <E as="button" className="buttonSecondary" type="button" onClick={() => reader.current?.reload()}>Повторить</E>
    </div>}
    {state.status === 'ready' && (state.value.length ? <div className="grid b2b-record-list">
      {state.value.map(item => <div className="card b2b-record" key={item.id} data-testid="document-summary">
        <h3>{item.title}</h3><p>{item.number || <E>Без номера</E>}</p><span className="muted">{item.type_code}</span>
        {signingEnabled && hasPermission('document.sign') && <div className={styles.documentActions}><E as="button" className="buttonSecondary" type="button" onClick={event => { signingTrigger.current = event.currentTarget; setSigningDocument(item); }}>Подпись ЭЦП</E></div>}
      </div>)}
    </div> : <E as="p" className="card muted" role="status">Данных пока нет</E>)}
    {signingEnabled && hasPermission('document.sign') && signingDocument && <DocumentSigningPanel key={signingDocument.id} document={signingDocument} scope={scope} onClose={closeSigning} />}
  </E>;
}

export default function DocumentsAccess() {
  const { loading, authScope, hasPermission } = useAuth();
  if (loading) return <E as="p" role="status">Проверка доступа…</E>;
  if (!hasPermission('document.read')) return <section className="card"><E as="p" role="alert">У вашей учётной записи нет доступа к документам.</E></section>;
  return <DocumentList key={authScope} scope={authScope} />;
}
