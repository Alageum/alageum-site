'use client';

import { useId, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import SiteMenuLinks from './SiteMenuLinks';
import CatalogMenuTree from './CatalogMenuTree';
import styles from './SiteMenuLinks.module.css';

// Keep the route tuples intact: nested equipment and translated links still use
// the same shared renderer as the mobile navigation.
function groupLinks(section) {
  const links = section.links;
  if (section.href === '/industries') return [
    { label: 'Энергетика', links: [links[0], links[6]] },
    { label: 'Промышленность', links: links.slice(1, 3) },
    { label: 'Строительство и транспорт', links: links.slice(3, 5) },
    { label: links[5][0], links: links.slice(5, 6) },
  ];
  if (section.href === '/manufacturers') return [
    { label: 'Трансформаторы', links: links.filter((_, i) => [0, 1, 5, 6].includes(i)) },
    { label: 'Распределительное оборудование', links: links.filter((_, i) => [2, 3, 4].includes(i)) },
    { label: 'Проектирование и строительство', links: links.filter((_, i) => i >= 7) },
  ];
  if (section.href === '/company') return [
    { label: 'О компании', links: links.slice(0, 3) },
    { label: 'Новости', links: links.slice(3, 4) },
    { label: 'Документы', links: links.slice(4, 5) },
    { label: 'Социальная ответственность', links: links.slice(5, 6) },
    { label: 'Карьера', links: links.slice(6, 7) },
    { label: 'Контакты', links: links.slice(7) },
  ];
  return links.map(link => ({ label: link[0], links: [link] }));
}

function SectionMenuPanel({ section, onNavigate }) {
  const groups = groupLinks(section).filter(group => group.links.length);
  const [selected, setSelected] = useState(0);
  const id = useId();
  const current = Math.min(selected, groups.length - 1);
  return <div className={styles.compactPanel}>
    <div className={styles.panelHeading}>
      <E as="strong">{section.title}</E>
    </div>
    <div className={styles.categoryLayout}>
      <div className={styles.categories} role="tablist" aria-orientation="vertical" aria-label={section.title}>
        {groups.map((group, index) => <button type="button" key={group.label} role="tab" id={`${id}-tab-${index}`} aria-selected={index === current} aria-controls={`${id}-content`} tabIndex={index === current ? 0 : -1}
          onPointerEnter={event => { if (event.pointerType === 'mouse') setSelected(index); }}
          onClick={() => setSelected(index)} onFocus={() => setSelected(index)}
          onKeyDown={event => {
            const next = event.key === 'ArrowDown' ? (index + 1) % groups.length : event.key === 'ArrowUp' ? (index - 1 + groups.length) % groups.length : event.key === 'Home' ? 0 : event.key === 'End' ? groups.length - 1 : null;
            if (next === null) return;
            event.preventDefault();
            event.currentTarget.parentElement.children[next].focus();
          }}><E as="span">{group.label}</E><span aria-hidden="true">›</span></button>)}
      </div>
      <div key={current} className={styles.categoryContent} role="tabpanel" id={`${id}-content`} aria-labelledby={`${id}-tab-${current}`}>
        <SiteMenuLinks links={groups[current].links} onNavigate={onNavigate} />
      </div>
    </div>
  </div>;
}

export default function SiteMenuPanel({ section, onNavigate }) {
  if (section.href !== '/catalog/directions') return <SectionMenuPanel section={section} onNavigate={onNavigate} />;

  return <div className={`${styles.compactPanel} ${styles.catalogPanel}`}>
    <div className={styles.panelHeading}><E as="strong">{section.title}</E></div>
    <CatalogMenuTree onNavigate={onNavigate} />
  </div>;
}
