import LocaleElement from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import styles from './Account.module.css';

export default function AccountFrame({ title, description, children }) {
  return <LocaleElement as="section" className={`brand-login ${styles.auth}`}>
    <LocaleElement as="aside" className="brand-login-story">
      <Image src="/photography/manufacturers/asia-trafo.webp" alt="Производственная линия Asia Trafo" width={1000} height={600} sizes="(max-width: 760px) 100vw, 50vw" />
      <LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC</LocaleElement>
      <LocaleElement as="h2">Ваш проект.<br />Единое пространство.</LocaleElement>
      <LocaleElement as="p">Личный аккаунт, доступ к компании и работа с документами.</LocaleElement>
    </LocaleElement>
    <LocaleElement as="div" className="brand-login-form">
      <LocaleElement as="p" className="site-eyebrow">ЛИЧНЫЙ КАБИНЕТ</LocaleElement>
      <LocaleElement as="h1">{title}</LocaleElement>
      {description && <LocaleElement as="p" className="muted">{description}</LocaleElement>}
      {children}
      <LocaleElement as="nav" className={styles.links} aria-label="Навигация аккаунта"><Link href="/login">Войти</Link><Link href="/register">Создать аккаунт</Link><Link href="/catalog/home">В каталог</Link></LocaleElement>
    </LocaleElement>
  </LocaleElement>;
}
