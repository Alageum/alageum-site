'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import { subscribeSession } from '@/lib/api/sessionTransport';
import { getDocumentSigning, createDocumentSigningIntent, submitDocumentSignature, cancelDocumentSigningIntent, reverifyDocumentSignature } from '@/lib/api/documentSigning';
import { createDocumentSigningFlow, initialSigningState, signingError } from '@/lib/documents/signingFlow';
import { signWithNCALayer } from '@/lib/documents/ncalayer';
import styles from './DocumentsWorkspace.module.css';

const reasons = {
  disabled: 'Подписание документов отключено на сервере.',
  verifier_unavailable: 'Серверная проверка ЭЦП не настроена. Подписание недоступно.',
  file_unavailable: 'Не найдена доступная неизменяемая PDF-версия для подписания.',
};
const statuses = {
  pending_verification: 'Подпись сохранена. Ожидает проверки сервером.',
  verified: 'Подпись проверена сервером.',
  rejected: 'Подпись отклонена сервером.',
};

export default function DocumentSigningPanel({ document, scope, onClose }) {
  const { isAuthScopeCurrent } = useAuth();
  const [state, setState] = useState(initialSigningState);
  const controller = useRef(null), heading = useRef(null);
  useLayoutEffect(() => {
    const isCurrent = () => isAuthScopeCurrent(scope);
    const flow = createDocumentSigningFlow({
      load: options => getDocumentSigning(document.id, options),
      prepare: (versionId, options) => createDocumentSigningIntent(document.id, versionId, options),
      submit: (intentId, signature, options) => submitDocumentSignature(document.id, intentId, signature, options),
      cancel: (intentId, options) => cancelDocumentSigningIntent(document.id, intentId, options),
      verifySignature: (signatureId, options) => reverifyDocumentSignature(document.id, signatureId, options),
      sign: signWithNCALayer, isCurrent, onChange: setState,
    });
    controller.current = flow;
    const unsubscribe = subscribeSession(() => { if (!isCurrent()) flow.dispose(); });
    const dismiss = () => { flow.close(); onClose(); };
    window.addEventListener('pagehide', dismiss);
    window.addEventListener('popstate', dismiss);
    heading.current?.focus();
    flow.reload();
    return () => {
      unsubscribe(); window.removeEventListener('pagehide', dismiss); window.removeEventListener('popstate', dismiss);
      flow.dispose(); if (controller.current === flow) controller.current = null;
    };
  }, [document.id, scope, isAuthScopeCurrent, onClose]);
  const close = () => { controller.current?.close(); onClose(); };
  const busy = ['preparing', 'signing', 'submitting', 'verifying'].includes(state.status);
  const version = state.value?.version;
  const canSign = state.status === 'ready' && state.value?.signing_allowed && version &&
    !['pending_verification', 'verified'].includes(state.signature?.status);
  return <section className={`card ${styles.signing}`} data-testid="document-signing" aria-label={`Подпись ЭЦП: ${document.title}`}>
    <div className={styles.signingHeader}>
      <h3 ref={heading} tabIndex={-1}>Подпись ЭЦП: {document.title}</h3>
      <button className="buttonSecondary" type="button" onClick={close}>Закрыть</button>
    </div>
    <p>Подписывается выбранная PDF-версия документа. Ключ и пароль используются только в приложении NCALayer на вашем компьютере.</p>
    {state.status === 'loading' && <p role="status">Проверка версии и доступности подписи…</p>}
    {version && <dl className={styles.signingPreview} aria-label="Версия для подписания">
      <div><dt>Документ</dt><dd>{document.number || 'Без номера'}</dd></div>
      <div><dt>Версия</dt><dd>{version.number}</dd></div>
      <div><dt>ID версии</dt><dd>{version.id}</dd></div>
      <div><dt>Формат и размер</dt><dd>PDF · {version.size_bytes.toLocaleString('ru-RU')} байт</dd></div>
      <div><dt>SHA-256</dt><dd className={styles.signingHash} data-testid="signing-hash">{version.sha256}</dd></div>
    </dl>}
    {state.value?.reason && <p role="status">{reasons[state.value.reason]}</p>}
    {state.signature && <p role="status" data-testid="signing-status">{statuses[state.signature.status]}</p>}
    <p className="muted">Получатель и отправка не настроены. Документ не отправлен.</p>
    {state.error && <p className="error" role="alert">{signingError(state.error)}</p>}
    {state.status === 'preparing' && <p role="status">Подготовка запроса и проверка SHA-256 точных байтов документа…</p>}
    {state.status === 'signing' && <p role="status">Подтвердите подписание в NCALayer. Ожидание до двух минут.</p>}
    {state.status === 'submitting' && <p role="status">Передача подписи на сервер для проверки…</p>}
    {state.status === 'verifying' && <p role="status">Повторная серверная проверка подписи…</p>}
    {state.status === 'retryable' && <p>Результат передачи не подтверждён. Повтор отправит ту же подпись с тем же запросом без нового подписания.</p>}
    {(state.status === 'submitting' || state.status === 'retryable' || state.status === 'verifying') && <p className="muted">Закрытие панели не отзывает подпись, если сервер уже принял её.</p>}
    <div className={styles.signingActions}>
      {state.status === 'ready' && !['pending_verification', 'verified'].includes(state.signature?.status) &&
        <button type="button" className="button" disabled={!canSign} onClick={() => controller.current?.start()}>Подписать в NCALayer</button>}
      {['ready', 'complete'].includes(state.status) && state.signature?.status === 'pending_verification' && <button type="button" className="button" onClick={() => controller.current?.retryVerification()}>Повторить проверку</button>}
      {state.status === 'retryable' && <button type="button" className="button" onClick={() => controller.current?.retrySubmit()}>Повторить передачу подписи</button>}
      {(state.status === 'error' || state.status === 'complete' || (state.status === 'ready' && state.signature)) &&
        <button type="button" className="buttonSecondary" onClick={() => controller.current?.reload()}>{state.status === 'error' ? 'Повторить загрузку' : 'Проверить статус'}</button>}
      {busy && <button type="button" className="buttonSecondary" onClick={close}>Отменить</button>}
    </div>
  </section>;
}
