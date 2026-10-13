'use client';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { useRouter } from '@/components/locale/navigation';
import { useAuth } from '@/components/AuthProvider';
import OrganizationChooser from '@/components/OrganizationChooser';
import { getSession } from '@/lib/api/client';
import { logout } from '@/lib/api/auth';
import { getSessionGeneration, subscribeSession } from '@/lib/api/sessionTransport';
import { getPersonalAccount, requestCompanyAccess } from '@/lib/api/registration';
import { accountError, companyRequestLabels } from '@/lib/account/model';
import useAccountOperation from './useAccountOperation';
import styles from './Account.module.css';

function CompanyRequestForm({ onSaved }) {
  const [name, setName] = useState(''), [identifier, setIdentifier] = useState(''), [message, setMessage] = useState('');
  const { pending, error, run } = useAccountOperation();
  function submit(event) {
    event.preventDefault();
    run(signal => requestCompanyAccess({ company_name: name, company_identifier: identifier, message }, signal), () => {
      setName(''); setIdentifier(''); setMessage(''); onSaved();
    });
  }
  return <LocaleElement as="form" className="form" onSubmit={submit} aria-busy={pending}>
    <LocaleElement as="label">Название компании<LocaleElement as="input" name="company_name" autoComplete="organization" required maxLength={240} value={name} onChange={event => setName(event.target.value)} disabled={pending} /></LocaleElement>
    <LocaleElement as="label">БИН / идентификатор компании<LocaleElement as="input" name="company_identifier" required maxLength={200} value={identifier} onChange={event => setIdentifier(event.target.value)} disabled={pending} /></LocaleElement>
    <LocaleElement as="label">Комментарий для администратора<LocaleElement as="textarea" name="message" rows={3} maxLength={2000} value={message} onChange={event => setMessage(event.target.value)} disabled={pending} /></LocaleElement>
    <LocaleElement as="p" className="muted">Заявка не открывает доступ автоматически. Администратор проверит вашу связь с компанией и назначит разрешённую роль.</LocaleElement>
    {error && <LocaleElement as="p" className="error" role="alert">{error}</LocaleElement>}
    <LocaleElement as="button" className="button" disabled={pending}>{pending ? 'Отправка…' : 'Запросить доступ'}</LocaleElement>
  </LocaleElement>;
}

function PersonalAccountScope({ generation }) {
  const router = useRouter();
  const { profile, setProfile } = useAuth();
  const [read, setRead] = useState({ status: 'loading', value: null, error: null });
  const [revision, setRevision] = useState(0), [choice, setChoice] = useState(false), [saved, setSaved] = useState(false);
  const { pending: signingOut, error: logoutError, run: runLogout } = useAccountOperation();
  const reload = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    const controller = new AbortController();
    const current = () => !controller.signal.aborted && generation === getSessionGeneration();
    getPersonalAccount(controller.signal).then(value => { if (current()) setRead({ status: 'ready', value, error: null }); })
      .catch(error => { if (current()) setRead({ status: 'error', value: null, error }); });
    return () => controller.abort();
  }, [generation, revision]);
  const selected = useCallback(next => { setProfile(next); setChoice(false); router.replace('/b2b'); }, [setProfile, router]);
  const closeChoice = useCallback(() => setChoice(false), []);
  function refresh() { setRead({ status: 'loading', value: null, error: null }); reload(); }
  function signOut() { runLogout(() => logout(), () => { setProfile(null); router.replace('/login'); }); }
  if (read.status === 'loading') return <LocaleElement as="section" className={styles.page}><LocaleElement as="p" role="status">Загрузка личного кабинета…</LocaleElement></LocaleElement>;
  if (read.status === 'error') return <LocaleElement as="section" className={styles.page}>
    <LocaleElement as="h1">Личный кабинет</LocaleElement><LocaleElement as="p" className="error" role="alert">{accountError(read.error)}</LocaleElement>
    <LocaleElement as="div" className={styles.actions}><Link href="/login?next=%2Faccount" className="button">Войти</Link><LocaleElement as="button" type="button" className="buttonSecondary" onClick={refresh}>Повторить загрузку</LocaleElement></LocaleElement>
  </LocaleElement>;
  const account = read.value;
  const requests = account.company_requests;
  const hasPending = requests.some(request => request.status === 'pending');
  return <LocaleElement as="section" className={styles.page}>
    <LocaleElement as="header" className={styles.heading}><LocaleElement as="div">
      <LocaleElement as="p" className="site-eyebrow">ЛИЧНЫЙ КАБИНЕТ</LocaleElement><LocaleElement as="h1">{account.user.display_name || 'Мой аккаунт'}</LocaleElement>
      <LocaleElement as="p" className={styles.longText} data-no-translate>{account.user.email}</LocaleElement>
      <LocaleElement as="p" className="muted">{account.email_verified ? 'Email подтверждён' : 'Email ещё не подтверждён'}</LocaleElement>
    </LocaleElement><LocaleElement as="button" type="button" className="buttonSecondary" onClick={signOut} disabled={signingOut}>{signingOut ? 'Выход…' : 'Выйти'}</LocaleElement></LocaleElement>
    {logoutError && <LocaleElement as="p" className="error" role="alert">{logoutError}</LocaleElement>}
    {saved && <LocaleElement as="p" className={styles.notice} role="status">Заявка отправлена на сервер. Доступ откроется только после одобрения администратором.</LocaleElement>}
    <LocaleElement as="div" className={styles.columns}>
      <LocaleElement as="section" className={styles.section}><LocaleElement as="h2">Доступ к компании</LocaleElement>
        <LocaleElement as="p">{hasPending ? 'Ваша заявка на проверке. Личный кабинет и локальные черновики доступны, пока администратор принимает решение.' : 'Заказы, документы и данные компании доступны только участникам с подтверждённым доступом.'}</LocaleElement>
        {profile?.organization && <LocaleElement as="p">Текущая организация: <LocaleElement as="strong" data-no-translate>{profile.organization.name}</LocaleElement></LocaleElement>}
        <LocaleElement as="div" className={styles.actions}>
          {profile?.organization && <Link href="/b2b" className="button">Открыть кабинет компании</Link>}
          <LocaleElement as="button" type="button" className="buttonSecondary" onClick={() => setChoice(true)}>Выбрать доступную компанию</LocaleElement>
          <LocaleElement as="button" type="button" className="buttonSecondary" onClick={refresh}>Обновить статус</LocaleElement>
        </LocaleElement>
        {requests.length > 0 && <LocaleElement as="ul" className={styles.requests} aria-label="Мои заявки на доступ">{requests.map(request => <LocaleElement as="li" key={request.id} className={styles.request}>
          <LocaleElement as="h3" data-no-translate>{request.company_name}</LocaleElement><LocaleElement as="span" className={styles.status}>{companyRequestLabels[request.status] || 'Статус уточняется'}</LocaleElement>
          <LocaleElement as="p" className="muted" data-no-translate>{request.company_identifier}</LocaleElement>
          {request.status === 'approved' && <LocaleElement as="p">Выберите компанию, чтобы загрузить актуальные права доступа.</LocaleElement>}
          {request.status === 'rejected' && <LocaleElement as="p">Уточните реквизиты и связь с компанией перед новой заявкой.</LocaleElement>}
        </LocaleElement>)}</LocaleElement>}
      </LocaleElement>
      <LocaleElement as="section" className={styles.section}><LocaleElement as="h2">Локальные черновики</LocaleElement>
        <LocaleElement as="p">Подборки, проекты и черновики документов сохраняются в этом браузере. Регистрация не отправляет их на сервер и не переносит между устройствами.</LocaleElement>
        <LocaleElement as="div" className={styles.actions}><Link href="/client" className="buttonSecondary">Открыть черновики</Link><Link href="/catalog/home">Перейти в каталог</Link></LocaleElement>
      </LocaleElement>
      <LocaleElement as="section" className={styles.section}><LocaleElement as="h2">Запросить доступ к компании</LocaleElement>
        {account.email_verified ? <CompanyRequestForm onSaved={() => { setSaved(true); refresh(); }} /> : <Link href="/verify-email" className="button">Подтвердить email</Link>}
      </LocaleElement>
    </LocaleElement>
    {choice && <OrganizationChooser modal expectedGeneration={generation} currentOrganizationId={profile?.organization?.id} onCancel={closeChoice} onSelected={selected} />}
  </LocaleElement>;
}

const subscribeReady = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function PersonalAccount() {
  const ready = useSyncExternalStore(subscribeReady, clientReady, serverReady);
  const generation = useSyncExternalStore(subscribeSession, getSessionGeneration, () => 0);
  if (!ready) return <LocaleElement as="section" className={styles.page}><LocaleElement as="p" role="status">Проверка сессии…</LocaleElement></LocaleElement>;
  if (!getSession().access_token) return <LocaleElement as="section" className={styles.page}>
    <LocaleElement as="h1">Личный кабинет</LocaleElement><LocaleElement as="p">Войдите или создайте аккаунт, чтобы запросить доступ к компании.</LocaleElement>
    <LocaleElement as="div" className={styles.actions}><Link href="/login?next=%2Faccount" className="button">Войти</Link><Link href="/register" className="buttonSecondary">Создать аккаунт</Link><Link href="/client">Локальные черновики</Link></LocaleElement>
  </LocaleElement>;
  // A new login/organization gets a fresh component: private data from the
  // previous scope is never visible while its replacement is loading.
  return <PersonalAccountScope key={generation} generation={generation} />;
}
