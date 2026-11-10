'use client';

import { useId, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { catalogDirectionById, catalogDirectionHref, topCatalogDirections } from '@/lib/public/catalog-directions';
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

  function directionLink(direction, label = direction.title) {
    return <Link href={catalogDirectionHref(direction.id)} aria-current={activeId === direction.id ? 'page' : undefined}>
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
        {topCatalogDirections.map(direction => {
          const branchActive = activeId === direction.id || direction.children.includes(activeId);
          return <li key={direction.id}>
            {direction.children.length ? <details open={branchActive || undefined}>
              <E as="summary" className={branchActive ? styles.activeBranch : undefined}>{direction.title}</E>
              <ul className={styles.children}>
                <li>{directionLink(direction, 'Обзор раздела')}</li>
                {direction.children.map(catalogDirectionById).map(child => <li key={child.id}>{directionLink(child)}</li>)}
              </ul>
            </details> : directionLink(direction)}
          </li>;
        })}
      </ul>
    </div>
  </E>;
}
