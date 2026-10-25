'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { getDocumentTypes, uploadDocument } from '@/lib/api/documents';
import { downloadDocumentFile } from '@/lib/api/client';
import { fileError } from '@/lib/documents/fileLabels';
import styles from './DocumentsWorkspace.module.css';

export function DocumentUpload({ scope, labels, onSaved }) {
  const { isAuthScopeCurrent } = useAuth();
  const [open, setOpen] = useState(false), [types, setTypes] = useState(null), [error, setError] = useState('');
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [attempt, setAttempt] = useState(0);
  const operation = useRef(null), alive = useRef(false), trigger = useRef(null), form = useRef(null);
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); }; }, []);
  useLayoutEffect(() => {
    if (!open) return;
    const request = new AbortController(); operation.current = request;
    getDocumentTypes({ signal: request.signal }).then(value => {
      if (alive.current && !request.signal.aborted && isAuthScopeCurrent(scope)) setTypes(value);
    }).catch(cause => {
      if (alive.current && !request.signal.aborted && isAuthScopeCurrent(scope)) setError(fileError(cause, labels));
    });
    return () => request.abort();
  }, [open, scope, isAuthScopeCurrent, labels, attempt]);
  function close() {
    operation.current?.abort(); operation.current = null;
    if (busy) { setNotice(labels.cancelled); onSaved(); }
    setOpen(false); setBusy(false); setError(''); trigger.current?.focus();
  }
  async function submit(event) {
    event.preventDefault();
    if (busy || operation.current?.upload || !isAuthScopeCurrent(scope)) return;
    const data = new FormData(event.currentTarget), request = new AbortController();
    operation.current?.abort(); request.upload = true; operation.current = request;
    setBusy(true); setError(''); setNotice('');
    try {
      await uploadDocument({ title: data.get('title'), number: data.get('number'), typeCode: data.get('type'), file: data.get('file') }, { signal: request.signal });
      if (!alive.current || request.signal.aborted || !isAuthScopeCurrent(scope) || operation.current !== request) return;
      setOpen(false); setNotice(labels.stored); onSaved(); trigger.current?.focus();
    } catch (cause) {
      if (alive.current && !request.signal.aborted && isAuthScopeCurrent(scope) && operation.current === request) setError(fileError(cause, labels));
    } finally {
      if (alive.current && !request.signal.aborted && isAuthScopeCurrent(scope) && operation.current === request) { operation.current = null; setBusy(false); }
    }
  }
  return <div className={styles.fileArea}>
    <button className="buttonSecondary" type="button" ref={trigger} disabled={open} onClick={() => { setTypes(null); setError(''); setNotice(''); setOpen(true); }}>{labels.upload}</button>
    {notice && <p role="status">{notice}</p>}
    {open && <form className={`card ${styles.uploadForm}`} ref={form} onSubmit={submit} aria-label={labels.upload} aria-busy={busy} onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); close(); } }}>
      <h3>{labels.upload}</h3><p id="document-file-hint" className="muted">{labels.hint}</p>
      {types === null && !error && <p role="status">{labels.loading}</p>}
      {types !== null && !types.length && <p role="status">{labels.noTypes}</p>}
      <label>{labels.title}<input name="title" required maxLength={300} disabled={busy} /></label>
      <label>{labels.number}<input name="number" maxLength={120} disabled={busy} /></label>
      <label>{labels.type}<select name="type" required disabled={busy || !types?.length} defaultValue=""><option value="" disabled>—</option>{types?.map(type => <option key={type.code} value={type.code}>{type.code === 'manual_attachment' ? labels.file : type.name}</option>)}</select></label>
      <label>{labels.file}<input name="file" type="file" accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png" required disabled={busy} aria-describedby="document-file-hint" /></label>
      {error && <p className="error" role="alert">{error}</p>}
      <div className={styles.documentActions}>
        <button className="button" type="submit" disabled={busy || !types?.length}>{busy ? labels.sending : labels.save}</button>
        <button className="buttonSecondary" type="button" onClick={close}>{labels.cancel}</button>
        {error && types === null && <button className="buttonSecondary" type="button" onClick={() => { setError(''); setAttempt(value => value + 1); }}>{labels.retry}</button>}
      </div>
    </form>}
  </div>;
}

export function DocumentDownload({ item, scope, labels }) {
  const { isAuthScopeCurrent } = useAuth();
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const operation = useRef(null), alive = useRef(false), url = useRef(null), timer = useRef(null);
  const release = () => { if (url.current) URL.revokeObjectURL(url.current); url.current = null; clearTimeout(timer.current); };
  useLayoutEffect(() => { alive.current = true; return () => { alive.current = false; operation.current?.abort(); release(); }; }, []);
  async function download() {
    if (operation.current || !isAuthScopeCurrent(scope)) return;
    const request = new AbortController(); operation.current = request; setBusy(true); setError('');
    try {
      const result = await downloadDocumentFile(item.id, { signal: request.signal });
      if (!alive.current || request.signal.aborted || !isAuthScopeCurrent(scope)) return;
      release(); url.current = URL.createObjectURL(result.blob);
      const link = document.createElement('a'); link.href = url.current;
      link.download = `document.${{ 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[result.contentType]}`;
      document.body.appendChild(link); link.click(); link.remove(); timer.current = setTimeout(release, 60000);
    } catch (cause) {
      if (alive.current && !request.signal.aborted && isAuthScopeCurrent(scope)) setError(fileError(cause, labels));
    } finally { if (alive.current && !request.signal.aborted && isAuthScopeCurrent(scope)) setBusy(false); if (operation.current === request) operation.current = null; }
  }
  return <div className={styles.documentActions}>
    <button className="buttonSecondary" type="button" disabled={busy || !item.latest_file_id} onClick={download}>{busy ? labels.downloading : labels.download}</button>
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
