'use client';

import { useId, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { catalogDirectionById, catalogDirectionHref, catalogEquipmentGroups } from '@/lib/public/catalog-directions';
import styles from './CatalogEquipmentNavigation.module.css';

export function CatalogEquipmentLayout({ activeId, children }) {
  return <div className={styles.layout}>
    <aside className={styles.sidebar}><CatalogEquipmentNavigation activeId={activeId} /></aside>
    <div className={styles.content}>{children}</div>
  </div>;
}

export default function CatalogEquipmentNavigation({ activeId }) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);

  function directionLink({ id, label = catalogDirectionById(id).title }) {
    return <Link href={catalogDirectionHref(id)} aria-current={activeId === id ? 'page' : undefined}>
      {label}
    </Link>;
  }

  return <E as="nav" className={styles.navigation} aria-label="Разделы оборудования">
    <E as="h2" className={styles.heading}>Разделы оборудования</E>
    <E as="button" type="button" className={styles.toggle} aria-controls={id} aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
      Разделы оборудования <span className={styles.chevron} aria-hidden="true" />
    </E>
    <div id={id} className={expanded ? styles.expanded : styles.links}>
      <Link href="/catalog" aria-current={activeId === 'all' ? 'page' : undefined}>Все оборудование</Link>
      <ul className={styles.tree}>
        {catalogEquipmentGroups.map(({ label, items }) => {
          const branchActive = items.some(item => item.id === activeId);
          return <li key={label}>
            {items.length > 1 ? <details open={branchActive || undefined}>
              <E as="summary" className={branchActive ? styles.activeBranch : undefined}>{label}</E>
              <ul className={styles.children}>
                {items.map(item => <li key={item.id}>{directionLink(item)}</li>)}
              </ul>
            </details> : directionLink(items[0])}
          </li>;
        })}
      </ul>
    </div>
  </E>;
}
