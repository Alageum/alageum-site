'use client';

import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import LocaleElement from '@/components/locale/LocaleElement';
import useHydrated from '@/components/ui/useHydrated';
import styles from './QuickFeedback.module.css';

export default function QuickFeedback({ onOpen }) {
  const dialog = useRef(null);
  const trigger = useRef(null);
  const nameInput = useRef(null);
  const closeButton = useRef(null);
  const submitting = useRef(false);
  const ready = useHydrated();
  const [status, setStatus] = useState('idle');
  const pending = status === 'sending';

  function open() {
    if (status === 'sent') flushSync(() => setStatus('idle'));
    onOpen();
    dialog.current.showModal();
    nameInput.current?.focus();
  }

  async function submit(event) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    submitting.current = true;
    setStatus('sending');
    try {
      const response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (response.status === 400) {
        setStatus('invalid');
      } else if (response.ok && (await response.json())?.sent === true) {
        form.reset();
        if (dialog.current?.open) closeButton.current?.focus();
        setStatus('sent');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      submitting.current = false;
    }
  }

  return <>
    <LocaleElement as="button" ref={trigger} className="site-feedback-link" type="button" aria-label="Обратная связь" aria-haspopup="dialog" aria-controls="quick-feedback" disabled={!ready} onClick={open}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.79a2 2 0 0 1-.45 2.11L8.09 9.89a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.89.33 1.83.56 2.79.69A2 2 0 0 1 22 16.92Z" /></svg>
      <LocaleElement as="span">Обратная связь</LocaleElement>
    </LocaleElement>
    <dialog ref={dialog} id="quick-feedback" className={styles.dialog} aria-labelledby="quick-feedback-title" onClose={() => trigger.current?.focus()}>
      <LocaleElement as="h2" id="quick-feedback-title">Заказать обратный звонок</LocaleElement>
      <LocaleElement as="p" className={styles.intro}>Оставьте имя и номер телефона. Мы вам перезвоним.</LocaleElement>
      <LocaleElement as="button" ref={closeButton} type="button" className={styles.close} aria-label="Закрыть" onClick={() => dialog.current.close()}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </LocaleElement>
      <form action="/api/feedback" method="post" onSubmit={submit} aria-busy={pending} hidden={status === 'sent'}>
        <fieldset disabled={pending} aria-labelledby="quick-feedback-title">
          <LocaleElement as="label" htmlFor="quick-feedback-name">Имя</LocaleElement>
          <input ref={nameInput} id="quick-feedback-name" name="name" autoComplete="name" maxLength={120} required />
          <LocaleElement as="label" htmlFor="quick-feedback-phone">Телефон</LocaleElement>
          <input id="quick-feedback-phone" name="phone" type="tel" autoComplete="tel" maxLength={40} placeholder="+7 (___) ___-__-__" required />
          <input name="website" defaultValue="" hidden />
          <LocaleElement as="button" type="submit" className="site-button site-button-primary">{pending ? 'Отправляем…' : 'Отправить заявку'}</LocaleElement>
        </fieldset>
      </form>
      <div role="status">
        {status === 'sent' && <LocaleElement as="p" className={styles.success}>Заявка отправлена. Мы свяжемся с вами по указанному номеру.</LocaleElement>}
      </div>
      <div role="alert">
        {status === 'invalid' && <LocaleElement as="p" className={styles.error}>Проверьте имя и номер телефона.</LocaleElement>}
        {status === 'error' && <p className={styles.error}><LocaleElement>Не удалось отправить заявку. Попробуйте ещё раз или позвоните нам.</LocaleElement> <a href="tel:+77710052222">+7 771 005 22 22</a></p>}
      </div>
    </dialog>
  </>;
}
