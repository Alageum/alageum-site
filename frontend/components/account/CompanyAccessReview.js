'use client';
import { useEffect, useState } from 'react';
import LocaleElement from '@/components/locale/LocaleElement';
import { useAuth } from '@/components/AuthProvider';
import { getCompanyAccessReview, approveCompanyAccess, rejectCompanyAccess } from '@/lib/api/registration';
import { accountError, companyRequestLabels } from '@/lib/account/model';
import useAccountOperation from './useAccountOperation';
import styles from './Account.module.css';

function ReviewRequest({ request, roles, onDecided }) {
  const [roleId, setRoleId] = useState(''), [reason, setReason] = useState(''), [decision, setDecision] = useState(null);
  const { pending, error, run } = useAccountOperation();
  const role = roles.find(item => item.id === roleId);
  function decide() {
    if (!decision || (decision === 'approve' && !role)) return;
    run(signal => decision === 'approve' ? approveCompanyAccess(request.id, role.id, signal) : rejectCompanyAccess(request.id, reason, signal), onDecided);
  }
  return <LocaleElement as="li" className={styles.request}>
    <LocaleElement as="h3" data-no-translate>{request.user?.display_name || request.display_name || request.company_name}</LocaleElement>
    <LocaleElement as="p" className={styles.longText} data-no-translate>{request.user?.email || request.email || ''}</LocaleElement>
    <LocaleElement as="p" data-no-translate>{request.company_name} · {request.company_identifier}</LocaleElement>
    {request.message && <LocaleElement as="p" className={styles.longText} data-no-translate>{request.message}</LocaleElement>}
    <LocaleElement as="span" className={styles.status}>{companyRequestLabels[request.status] || 'Статус уточняется'}</LocaleElement>
    {request.status === 'pending' && <>
      <LocaleElement as="div" className="form">
        <LocaleElement as="label">Роль в текущей компании<LocaleElement as="select" value={roleId} onChange={event => { setRoleId(event.target.value); setDecision(null); }} disabled={pending}>
          <LocaleElement as="option" value="">Выберите роль</LocaleElement>
          {roles.map(item => <LocaleElement as="option" key={item.id} value={item.id} data-no-translate>{item.name || item.code}</LocaleElement>)}
        </LocaleElement></LocaleElement>
        <LocaleElement as="label">Причина отклонения (необязательно)<LocaleElement as="textarea" rows={2} value={reason} maxLength={1000} onChange={event => setReason(event.target.value)} disabled={pending} /></LocaleElement>
      </LocaleElement>
      {!roles.length && <LocaleElement as="p" className="muted">Нет доступных ролей. Одобрение недоступно.</LocaleElement>}
      <LocaleElement as="div" className={styles.actions}>
        <LocaleElement as="button" type="button" className="button" disabled={pending || !role} onClick={() => setDecision('approve')}>Одобрить</LocaleElement>
        <LocaleElement as="button" type="button" className="buttonSecondary" disabled={pending} onClick={() => setDecision('reject')}>Отклонить</LocaleElement>
      </LocaleElement>
      {decision && <LocaleElement as="section" className={styles.confirmation} aria-label="Подтверждение решения">
        <LocaleElement as="p">{decision === 'approve' ? 'Подтвердите доступ к текущей компании с выбранной ролью:' : 'Подтвердите отклонение заявки.'}</LocaleElement>
        {decision === 'approve' && <LocaleElement as="strong" data-no-translate>{role?.name || role?.code}</LocaleElement>}
        <LocaleElement as="div" className={styles.actions}><LocaleElement as="button" type="button" className="button" disabled={pending} onClick={decide}>{pending ? 'Сохранение…' : 'Подтвердить решение'}</LocaleElement><LocaleElement as="button" type="button" className="buttonSecondary" disabled={pending} onClick={() => setDecision(null)}>Отмена</LocaleElement></LocaleElement>
      </LocaleElement>}
      {error && <LocaleElement as="p" className="error" role="alert">{error} Обновите список, прежде чем повторять решение.</LocaleElement>}
    </>}
  </LocaleElement>;
}

function ReviewScope({ scope }) {
  const { isAuthScopeCurrent } = useAuth();
  const [revision, setRevision] = useState(0), [read, setRead] = useState({ status: 'loading', value: null, error: null });
  useEffect(() => {
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && isAuthScopeCurrent(scope);
    getCompanyAccessReview(controller.signal).then(value => { if (current()) setRead({ status: 'ready', value, error: null }); })
      .catch(error => { if (current()) setRead({ status: 'error', value: null, error }); });
    return () => controller.abort();
  }, [scope, revision, isAuthScopeCurrent]);
  function refresh() { setRead({ status: 'loading', value: null, error: null }); setRevision(value => value + 1); }
  return <LocaleElement as="section" className={styles.review}>
    <LocaleElement as="h1">Заявки на доступ к компании</LocaleElement>
    <LocaleElement as="p" className="muted">Проверьте личность и связь заявителя с текущей компанией перед назначением роли. Права проверяются сервером при каждом решении.</LocaleElement>
    <LocaleElement as="div"><LocaleElement as="button" className="buttonSecondary" type="button" onClick={refresh}>Обновить список</LocaleElement></LocaleElement>
    {read.status === 'loading' ? <LocaleElement as="p" role="status">Загрузка заявок…</LocaleElement> : read.status === 'error' ? <LocaleElement as="p" className="error" role="alert">{accountError(read.error)}</LocaleElement> : read.value.requests.length === 0 ? <LocaleElement as="p" role="status">Заявок нет.</LocaleElement> : <LocaleElement as="ul" className={styles.requests}>{read.value.requests.map(request => <ReviewRequest key={request.id} request={request} roles={read.value.roles} onDecided={refresh} />)}</LocaleElement>}
  </LocaleElement>;
}

export default function CompanyAccessReview() {
  const { hasPermission, authScope, loading } = useAuth();
  if (loading) return <LocaleElement as="p" role="status">Проверка доступа…</LocaleElement>;
  if (!authScope || !hasPermission('organization.manage_users')) return <LocaleElement as="p" role="alert">Нет доступа к управлению участниками компании.</LocaleElement>;
  return <ReviewScope key={authScope} scope={authScope} />;
}
