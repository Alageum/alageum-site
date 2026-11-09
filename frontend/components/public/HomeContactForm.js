'use client';

import { useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import useHydrated from '@/components/ui/useHydrated';
import CorporateArrow from './CorporateArrow';

const salesEmail = 'sales@alageum.com';

export default function HomeContactForm() {
  const ready = useHydrated();
  const [status, setStatus] = useState('idle');
  const sending = useRef(false);
  const submission = useRef(null);

  async function submit(event) {
    event.preventDefault();
    if (!ready || sending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const contact = {
      name: String(values.get('name') ?? '').trim(),
      email: String(values.get('email') ?? '').trim(),
      message: String(values.get('message') ?? '').trim(),
      website: values.get('website'),
    };
    if (!contact.message) {
      setStatus('invalid');
      return;
    }

    sending.current = true;
    setStatus('sending');
    try {
      const content = JSON.stringify(contact);
      if (submission.current?.content !== content) {
        submission.current = { content, id: Array.from(window.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('') };
      }
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...contact, id: submission.current.id }),
      });
      if (response.status === 429) {
        setStatus('limited');
      } else if (!response.ok || (await response.json()).sent !== true) {
        setStatus('error');
      } else {
        form.reset();
        submission.current = null;
        setStatus('sent');
      }
    } catch {
      setStatus('error');
    } finally {
      sending.current = false;
    }
  }

  return <section id="home-contact" className="corp-home-contact" aria-labelledby="home-contact-heading">
    <div className="site-container corp-section corp-home-contact-layout">
      <div>
        <E as="p" className="site-eyebrow">08 / <E>ФОРМА ДЛЯ СВЯЗИ</E></E>
        <E as="h2" id="home-contact-heading">Напишите в отдел продаж</E>
        <E as="p" id="home-contact-instructions">Укажите, какое оборудование или работы вам нужны.</E>
        <div className="corp-home-contact-links">
          <a href="tel:+77710052222">+7 771 005 22 22</a>
          <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
        </div>
      </div>
      <form action="/api/contact" method="post" onSubmit={submit} onChange={() => { if (status !== 'idle') setStatus('idle'); }} aria-describedby="home-contact-instructions" aria-busy={status === 'sending'}>
        <fieldset disabled={!ready || status === 'sending'}>
          <label htmlFor="home-contact-name"><E>Имя</E><input id="home-contact-name" name="name" autoComplete="name" maxLength={120} required pattern=".*\S.*" /></label>
          <label htmlFor="home-contact-email">Email<input id="home-contact-email" name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          <label htmlFor="home-contact-message"><E>Сообщение</E><textarea id="home-contact-message" name="message" rows={4} maxLength={1000} required /></label>
          <input type="text" name="website" hidden tabIndex={-1} autoComplete="off" />
          <E as="button" type="submit" className="site-button site-button-primary">{status === 'sending' ? 'Отправляем…' : 'Отправить сообщение'} <CorporateArrow /></E>
        </fieldset>
        <E as="div" className="corp-home-contact-success" role="status">{status === 'sent' ? 'Сообщение отправлено.' : ''}</E>
        {status === 'invalid' && <E as="p" role="alert">Введите текст сообщения.</E>}
        {status === 'limited' && <E as="p" role="alert">Слишком много запросов. Попробуйте позже.</E>}
        {status === 'error' && <E as="p" role="alert">Не удалось отправить сообщение. Попробуйте ещё раз или свяжитесь с отделом продаж напрямую.</E>}
      </form>
    </div>
  </section>;
}
