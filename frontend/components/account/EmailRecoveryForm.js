'use client';
import { useState } from 'react';
import LocaleElement from '@/components/locale/LocaleElement';
import { forgotAccountPassword, resendAccountVerification } from '@/lib/api/registration';
import useAccountOperation from './useAccountOperation';

export default function EmailRecoveryForm({ verification = false }) {
  const [email, setEmail] = useState(''), [accepted, setAccepted] = useState(false);
  const { pending, error, run } = useAccountOperation();
  const action = verification ? resendAccountVerification : forgotAccountPassword;
  function submit(event) {
    event.preventDefault();
    run(signal => action(email, signal), () => setAccepted(true));
  }
  return <LocaleElement as="form" className="form card" onSubmit={submit} aria-busy={pending}>
    <LocaleElement as="label">Email<LocaleElement as="input" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => { setEmail(event.target.value); setAccepted(false); }} disabled={pending} /></LocaleElement>
    {accepted && <LocaleElement as="p" role="status">Если для этого адреса доступно действие, письмо со ссылкой придёт в ближайшее время. Проверьте также папку «Спам».</LocaleElement>}
    {error && <LocaleElement as="p" className="error" role="alert">{error}</LocaleElement>}
    <LocaleElement as="button" className="button" disabled={pending || accepted}>{pending ? 'Отправка…' : accepted ? 'Запрос принят' : verification ? 'Отправить письмо повторно' : 'Получить ссылку'}</LocaleElement>
    {accepted && <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => setAccepted(false)}>Повторить запрос</LocaleElement>}
  </LocaleElement>;
}
