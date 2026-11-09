import LocaleElement from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import styles from './Account.module.css';

const defaultLinks = [['Войти', '/login'], ['Создать аккаунт', '/register']];

export default function AccountFrame({ title, description, children, links = defaultLinks, secondary }) {
  return <section className={styles.auth}>
    <div className={styles.authContent}>
      <LocaleElement as="p" className="site-eyebrow">ЛИЧНЫЙ КАБИНЕТ</LocaleElement>
      <LocaleElement as="h1">{title}</LocaleElement>
      {description && <LocaleElement as="p" className={styles.authDescription}>{description}</LocaleElement>}
      {children}
      <LocaleElement as="nav" className={styles.links} aria-label="Навигация аккаунта">
        {links.map(([label, href]) => <Link key={href} href={href}>{label}</Link>)}
        <Link href="/catalog">В каталог</Link>
      </LocaleElement>
      {secondary && <div className={styles.secondary}>{secondary}</div>}
    </div>
    <figure className={styles.authPhoto}>
      <Image src="/photography/manufacturers/asia-trafo.webp" alt="Производственная линия Asia Trafo" width={1000} height={600} sizes="(max-width: 760px) 100vw, 45vw" />
      <figcaption><span>ALAGEUM ELECTRIC</span><strong>Asia Trafo</strong><LocaleElement as="span">Шымкент, Казахстан</LocaleElement></figcaption>
    </figure>
  </section>;
}
