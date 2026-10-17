'use client';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { verifyAccountEmail, resetAccountPassword } from '@/lib/api/registration';
import { passwordError, readAccountToken } from '@/lib/account/model';
import AccountFrame from './AccountFrame';
import EmailRecoveryForm from './EmailRecoveryForm';
import useAccountOperation from './useAccountOperation';
import styles from './Account.module.css';

function TokenForm({ verification, initialToken, onConsumed }) {
  const [token, setToken] = useState(initialToken), [complete, setComplete] = useState(false);
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const { pending, error, setError, run } = useAccountOperation();
  function submit(event) {
    event.preventDefault();
    if (!token) return;
    if (!verification) {
      const issue = passwordError(password, confirmation);
      if (issue) { setError(issue); return; }
    }
    run(signal => verification ? verifyAccountEmail(token, signal) : resetAccountPassword(token, password, signal), () => {
      setToken(''); onConsumed();
      setPassword(''); setConfirmation(''); setComplete(true);
    });
  }
  return <AccountFrame title={verification ? 'Подтверждение email' : 'Новый пароль'} description={verification ? 'Подтвердите адрес, чтобы войти в личный кабинет.' : 'Установите новый уникальный пароль. После сохранения войдите снова.'}>
    {token === null ? <LocaleElement as="p" role="status">Проверка ссылки…</LocaleElement> : complete ? <LocaleElement as="section" className={styles.notice} role="status">
      <LocaleElement as="h2">{verification ? 'Email подтверждён' : 'Пароль изменён'}</LocaleElement>
      <LocaleElement as="p">{verification ? 'Теперь можно войти в личный кабинет и запросить доступ к компании.' : 'Используйте новый пароль для входа.'}</LocaleElement>
      <LocaleElement as="div" className={styles.actions}><Link href="/login?next=%2Faccount" className="button">Войти в личный кабинет</Link></LocaleElement>
    </LocaleElement> : token ? <>
      <LocaleElement as="form" className="form card" onSubmit={submit} aria-busy={pending}>
        {!verification && <>
          <LocaleElement as="label">Новый пароль<LocaleElement as="input" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} /></LocaleElement>
          <LocaleElement as="p" className="muted">От 12 до 128 символов.</LocaleElement>
          <LocaleElement as="label">Повторите пароль<LocaleElement as="input" name="password_confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} /></LocaleElement>
        </>}
        {error && <LocaleElement as="p" className="error" role="alert">{error}</LocaleElement>}
        <LocaleElement as="button" className="button" disabled={pending}>{pending ? 'Сохранение…' : verification ? 'Подтвердить email' : 'Сохранить пароль'}</LocaleElement>
      </LocaleElement>
      {error && <><LocaleElement as="h2">Запросить новую ссылку</LocaleElement><EmailRecoveryForm verification={verification} /></>}
    </> : <>
      <LocaleElement as="p" className="muted">Откройте ссылку из письма или запросите новую ниже. После обновления страницы может понадобиться снова открыть письмо.</LocaleElement>
      <EmailRecoveryForm verification={verification} />
    </>}
  </AccountFrame>;
}

function TokenLocation({ verification }) {
  const search = useSearchParams().toString();
  const initialized = useRef(false);
  const [location, setLocation] = useState({ token: null, sequence: 0 });
  const capture = useCallback((invalidate = false) => {
    const hasToken = new URLSearchParams(window.location.search).has('token') || new URLSearchParams(window.location.hash.replace(/^#/, '')).has('token');
    // Next synchronizes search params after our own history.replaceState. That
    // cleanup must not discard the token. A new link or Back/Forward does reset
    // the mounted form and its request ownership, even while a POST is pending.
    if (initialized.current && !hasToken && !invalidate) return;
    initialized.current = true;
    const next = readAccountToken(window.location);
    if (hasToken) window.history.replaceState(window.history.state, '', next.cleanHref);
    setLocation(previous => ({ token: next.token, sequence: previous.sequence + 1 }));
  }, []);
  useEffect(() => { capture(); }, [capture, search]);
  useEffect(() => {
    const historyChanged = () => capture(true);
    const hashChanged = () => capture();
    window.addEventListener('hashchange', hashChanged);
    window.addEventListener('popstate', historyChanged);
    return () => { window.removeEventListener('hashchange', hashChanged); window.removeEventListener('popstate', historyChanged); };
  }, [capture]);
  const consumed = useCallback(() => setLocation(previous => ({ ...previous, token: '' })), []);
  return <TokenForm key={location.sequence} verification={verification} initialToken={location.token} onConsumed={consumed} />;
}

export default function TokenActionForm({ verification = false }) {
  return <Suspense fallback={<LocaleElement as="p" role="status">Проверка ссылки…</LocaleElement>}><TokenLocation verification={verification} /></Suspense>;
}
