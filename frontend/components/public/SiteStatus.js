import LocaleElement from '@/components/locale/LocaleElement';
import styles from './SiteStatus.module.css';

export default function SiteStatus({ code, title, description, note, children, alert }) {
  return <section className={styles.status} role={alert ? 'alert' : undefined}>
    <LocaleElement as="p" className={`site-eyebrow ${styles.code}`}>{code}</LocaleElement>
    <LocaleElement as="h1">{title}</LocaleElement>
    <LocaleElement as="p" className={styles.description}>{description}</LocaleElement>
    {note && <LocaleElement as="p" className={styles.description}>{note}</LocaleElement>}
    <div className="site-actions">{children}</div>
  </section>;
}
