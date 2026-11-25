'use client';

import { useId, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { catalogDirectionById, catalogDirectionHref, catalogEquipmentGroups } from '@/lib/public/catalog-directions';
import { catalogMenuContents } from '@/lib/public/catalog-menu-contents';
import { corporateProfileHref } from '@/lib/public/content';
import styles from './SiteMenuLinks.module.css';

const catalogueEditions = [
  ['Имиджевый каталог', corporateProfileHref],
  ['Каталог подстанций', '/documents/substations-local-edition.pdf'],
  ['Каталог трансформаторов', '/documents/transformers-2026-print.pdf'],
];

function EquipmentContent({ item, id, onNavigate }) {
  const direction = catalogDirectionById(item.id);
  const title = item.label ?? direction.title;
  const entries = catalogMenuContents[item.id] ?? direction.subtypes.map(label => [label]);

  return <div id={id} className={styles.equipmentContent}>
    <h3>
      <Link className={styles.equipmentSectionLink} href={catalogDirectionHref(item.id)} onNavigate={onNavigate}>
        <E>{title}</E><span aria-hidden="true">↗</span>
      </Link>
    </h3>
    {entries.length > 0
      ? <ul className={styles.equipmentProducts}>{entries.map(([label, productId]) => <li key={label}>
        {productId
          ? <Link className={styles.equipmentProductLink} href={`/catalog/${encodeURIComponent(productId)}`} prefetch={false} onNavigate={onNavigate}>
            <E>{label}</E><span aria-hidden="true">↗</span>
          </Link>
          : <E as="span" className={styles.equipmentProductLabel}>{label}</E>}
      </li>)}</ul>
      : <E as="p">{direction.description}</E>}
  </div>;
}

export default function CatalogMenuTree({ mobile = false, onNavigate }) {
  const id = useId();
  const [expanded, setExpanded] = useState(null);
  const [selected, setSelected] = useState(null);
  const contentId = `${id}-equipment`;

  function toggleGroup(group) {
    const open = expanded !== group.label;
    setExpanded(open ? group.label : null);
    setSelected(open ? group.items[0] : null);
  }

  return <>
    <div className={mobile ? styles.mobileCatalogTree : styles.equipmentLayout}>
      <ul className={styles.equipmentTree}>
        {catalogEquipmentGroups.map((group, index) => {
          const open = expanded === group.label;
          const groupId = `${id}-group-${index}`;
          return <li key={group.label}>
            <E as="button" type="button" className={styles.equipmentGroup} aria-expanded={open}
              aria-controls={groupId} data-site-menu-link onClick={() => toggleGroup(group)}>
              <E>{group.label}</E><span className={styles.treeChevron} aria-hidden="true" />
            </E>
            <ul id={groupId} className={styles.equipmentBranches} hidden={!open}>
              {open && group.items.map(item => {
                const active = selected?.id === item.id;
                return <li key={item.id}>
                  <E as="button" type="button" className={styles.equipmentItem} aria-pressed={active}
                    aria-controls={!mobile || active ? contentId : undefined}
                    onPointerEnter={event => {
                      if (!mobile && event.pointerType === 'mouse') setSelected(item);
                    }}
                    onClick={() => setSelected(item)}>
                    {item.label ?? catalogDirectionById(item.id).title}
                  </E>
                  {mobile && active && <EquipmentContent item={item} id={contentId} onNavigate={onNavigate} />}
                </li>;
              })}
            </ul>
          </li>;
        })}
      </ul>
      {!mobile && <div id={contentId} className={styles.equipmentPane} aria-live="polite">
        {selected
          ? <EquipmentContent key={selected.id} item={selected} onNavigate={onNavigate} />
          : <E as="p" className={styles.equipmentPrompt}>Выберите подраздел слева.</E>}
      </div>}
    </div>
    <E as="ul" className={styles.catalogueEditions} aria-label="Печатные каталоги">
      {catalogueEditions.map(([label, href]) => (
        <li key={href}>
          <E as="a" href={href} target="_blank" rel="noopener noreferrer">
            <E>{label}</E><E as="small" className={styles.pdfLabel}>PDF</E>
          </E>
        </li>
      ))}
    </E>
  </>;
}
