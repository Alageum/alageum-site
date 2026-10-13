'use client';
import { useState } from 'react';
import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { registerAccount } from '@/lib/api/registration';
import { passwordError } from '@/lib/account/model';
import AccountFrame from './AccountFrame';
import useAccountOperation from './useAccountOperation';
import styles from './Account.module.css';

export default function RegistrationForm() {
  const [name, setName] = useState(''), [email, setEmail] = useState('');
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [accepted, setAccepted] = useState(false);
  const { pending, error, setError, run } = useAccountOperation();
  function submit(event) {
    event.preventDefault();
    const issue = passwordError(password, confirmation);
    if (issue) { setError(issue); return; }
    run(signal => registerAccount({ email, password, display_name: name }, signal), () => {
      setPassword(''); setConfirmation(''); setAccepted(true);
    });
  }
  return <AccountFrame title="Создать аккаунт" description="Сначала подтвердите email. Доступ к данным компании открывается только после проверки администратором.">
    {accepted ? <LocaleElement as="section" className={styles.notice} role="status">
      <LocaleElement as="h2">Проверьте почту</LocaleElement>
      <LocaleElement as="p">Если адрес доступен для регистрации, на него придёт ссылка подтверждения. Проверьте также папку «Спам».</LocaleElement>
      <LocaleElement as="div" className={styles.actions}><Link href="/verify-email" className="buttonSecondary">Повторить письмо</Link><Link href="/login">Перейти ко входу</Link></LocaleElement>
    </LocaleElement> : <LocaleElement as="form" className="form card" onSubmit={submit} aria-busy={pending}>
      <LocaleElement as="label">Имя и фамилия<LocaleElement as="input" name="display_name" autoComplete="name" required maxLength={200} value={name} onChange={event => setName(event.target.value)} disabled={pending} /></LocaleElement>
      <LocaleElement as="label">Email<LocaleElement as="input" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} disabled={pending} /></LocaleElement>
      <LocaleElement as="label">Пароль<LocaleElement as="input" name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={pending} aria-describedby="password-help" /></LocaleElement>
      <LocaleElement as="p" id="password-help" className="muted">От 12 до 128 символов. Используйте уникальный пароль.</LocaleElement>
      <LocaleElement as="label">Повторите пароль<LocaleElement as="input" name="password_confirmation" type="password" autoComplete="new-password" required minLength={12} maxLength={128} value={confirmation} onChange={event => setConfirmation(event.target.value)} disabled={pending} /></LocaleElement>
      {error && <LocaleElement as="p" className="error" role="alert">{error}</LocaleElement>}
      <LocaleElement as="button" className="button" disabled={pending}>{pending ? 'Создание аккаунта…' : 'Создать аккаунт'}</LocaleElement>
    </LocaleElement>}
  </AccountFrame>;
}
