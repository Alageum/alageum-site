import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import styles from './SiteMenuLinks.module.css';

export default function SiteMenuLinks({links, onNavigate, mobile = false}) {
  return <div className={mobile ? styles.mobile : styles.tree}>{links.map(([label, href, note, children]) => <div className={styles.group} key={href}>
    <Link href={href} className={styles.link} data-site-menu-link onNavigate={onNavigate}><E as="span">{label}</E>{note && <E as="small">{note}</E>}</Link>
    {children?.length > 0 && <ul className={styles.children}>{children.map(([childLabel, childHref]) => <li key={childHref}><Link href={childHref} onNavigate={onNavigate}>{childLabel}</Link></li>)}</ul>}
  </div>)}</div>;
}
