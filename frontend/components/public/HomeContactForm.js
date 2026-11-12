'use client';

import { useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import useHydrated from '@/components/ui/useHydrated';
import CorporateArrow from './CorporateArrow';
import SectionEyebrow from './SectionEyebrow';

const salesEmail = 'sales@alageum.com';

export default function HomeContactForm({ equipment = [], number }) {
  const documentation = equipment.length > 0;
  const sectionId = documentation ? 'documentation-request' : 'home-contact';
  const ready = useHydrated();
  const [status, setStatus] = useState('idle');
  const sending = useRef(false);
  const submission = useRef(null);

  async function submit(event) {
    event.preventDefault();
    if (!ready || sending.current) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const message = String(values.get('message') ?? '').trim();
    const direction = equipment.find(item => item.id === values.get('equipment'));
    const contact = {
      name: String(values.get('name') ?? '').trim(),
      email: String(values.get('email') ?? '').trim(),
      message: documentation ? `Запрос технической документации\nОборудование: ${direction?.title || 'Не указано'}\n\n${message}` : message,
      page: window.location.pathname,
      website: values.get('website'),
    };
    if (!message) {
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

  return <section id={sectionId} className="corp-home-contact" aria-labelledby={`${sectionId}-heading`}>
    <div className="site-container corp-section corp-home-contact-layout">
      <div>
        {!documentation && <SectionEyebrow number={number} label="Обратная связь" />}
        <E as="h2" id={`${sectionId}-heading`}>{documentation ? 'Запросить документацию' : 'Напишите в отдел продаж'}</E>
        <E as="p" id={`${sectionId}-instructions`}>{documentation ? 'Укажите серию или модель, параметры и нужный документ: паспорт, чертёж, сертификат или протокол испытаний.' : 'Укажите, какое оборудование или работы вам нужны.'}</E>
        <div className="corp-home-contact-links">
          <a href="tel:+77710052222">+7 771 005 22 22</a>
          <a href={`mailto:${salesEmail}`}>{salesEmail}</a>
        </div>
      </div>
      <form action="/api/contact" method="post" onSubmit={submit} onChange={() => { if (status !== 'idle') setStatus('idle'); }} aria-describedby={`${sectionId}-instructions`} aria-busy={status === 'sending'}>
        <fieldset disabled={!ready || status === 'sending'}>
          <label><E>Имя</E><input id={`${sectionId}-name`} name="name" autoComplete="name" maxLength={120} required pattern=".*\S.*" /></label>
          <label>Email<input id={`${sectionId}-email`} name="email" type="email" autoComplete="email" maxLength={254} required /></label>
          {documentation && <label><E>Оборудование</E><select name="equipment" defaultValue="">
            <E as="option" value="">Выберите направление</E>
            {equipment.map(({ id, title }) => <E as="option" key={id} value={id}>{title}</E>)}
          </select></label>}
          <label><E>{documentation ? 'Какие документы нужны' : 'Сообщение'}</E><textarea id={`${sectionId}-message`} name="message" rows={4} maxLength={documentation ? 850 : 1000} required /></label>
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
