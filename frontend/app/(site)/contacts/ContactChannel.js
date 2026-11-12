'use client';
import {translateText} from '@/lib/i18n/translate';

import {useState} from 'react';
import {useLocale} from '@/components/locale/LocaleProvider';
import styles from './ContactChannel.module.css';

const messages = {
  ru: {phone: 'Позвонить', email: 'Написать', copyPhone: 'Скопировать номер телефона', copyEmail: 'Скопировать адрес почты', copied: 'Скопировано', failed: 'Не удалось скопировать. Выделите контакт и скопируйте вручную.'},
  en: {phone: 'Call', email: 'Email', copyPhone: 'Copy phone number', copyEmail: 'Copy email address', copied: 'Copied', failed: 'Could not copy. Select the contact and copy it manually.'},
  kk: {phone: 'Қоңырау шалу', email: 'Хат жазу', copyPhone: 'Телефон нөмірін көшіру', copyEmail: 'Электрондық пошта мекенжайын көшіру', copied: 'Көшірілді', failed: 'Көшіру мүмкін болмады. Контактіні таңдап, қолмен көшіріңіз.'},
};

export default function ContactChannel({kind, href, value}) {
  const locale = useLocale();
  const text = messages[locale] || Object.fromEntries(Object.entries(messages.ru).map(([key, value]) => [key, translateText(value, locale)]));
  const [state, setState] = useState('idle');
  const phone = kind === 'phone';
  async function copy() {
    setState('pending');
    try {
      await navigator.clipboard.writeText(value);
      setState('copied');
    } catch {
      setState('failed');
    }
  }
  return <div className={styles.channel}>
    <div className={`${styles.row} ${phone ? styles.phone : styles.email}`}>
      <a href={href} className={styles.action}>
        <span className={styles.label}>{phone ? text.phone : text.email}</span>
        <span className={styles.value}>{value}</span>
      </a>
      <button className={styles.copy} type="button" disabled={state === 'pending'} onClick={copy}
        aria-label={phone ? text.copyPhone : text.copyEmail} title={state === 'copied' ? text.copied : phone ? text.copyPhone : text.copyEmail}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          {state === 'copied' ? <path d="m5 12 4 4L19 6"/> : <><rect x="8" y="8" width="12" height="12" rx="1.5"/><path d="M15 8V4H4v11h4"/></>}
        </svg>
      </button>
    </div>
    <p className={styles.feedback} role="status" aria-live="polite">{state === 'copied' ? text.copied : state === 'failed' ? text.failed : ''}</p>
  </div>;
}
