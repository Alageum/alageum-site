'use client';

import { useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporateArrow from '@/components/public/CorporateArrow';
import HomeContactForm from '@/components/public/HomeContactForm';
import { catalogDirectionById, catalogDirectionHref, catalogEquipmentGroups } from '@/lib/public/catalog-directions';
import styles from './designers.module.css';

const groupIds = ['transformers', 'substations', 'kru', 'nku', 'control', 'oru', 'railway', 'mining', 'oil', 'high-voltage'];
const groups = groupIds.map((id, i) => ({ id, title: catalogEquipmentGroups[i].label, items: catalogEquipmentGroups[i].items }));
const equipmentOptions = [...groups, { id: 'other', title: 'Другое оборудование' }].map(({ id, title }) => ({ id, title }));

export default function DesignerWorkspace({ children }) {
  const [activeId, setActiveId] = useState('high-voltage');
  const [selectedEquipment, setSelectedEquipment] = useState('');
  const active = groups.find(group => group.id === activeId);

  return <>
    <section id="technical-catalogs" className={styles.section} aria-labelledby="designer-equipment">
      <div className={styles.sectionHeading}>
        <E as="h2" id="designer-equipment">Оборудование и документация</E>
        <Link className="site-text-link" href="/catalog">Весь каталог <CorporateArrow /></Link>
      </div>
      <div className={styles.equipment}>
        <E as="div" className={styles.equipmentNav} role="group" aria-label="Направления оборудования">
          {[groups.at(-1), ...groups.slice(0, -1)].map(({ id, title }) => (
            <E as="button" type="button" key={id} aria-pressed={id === activeId} aria-controls="designer-equipment-panel" onClick={() => setActiveId(id)}>
              <E>{title}</E><CorporateArrow />
            </E>
          ))}
        </E>
        <div id="designer-equipment-panel" className={styles.equipmentPanel}>
          <E as="h3">{active.title}</E>
          <E as="p">Выберите подраздел для просмотра серий или запросите чертёж, опросный лист, сертификат или протокол испытаний для нужного исполнения.</E>
          <ul className={styles.directionList}>
            {active.items.map(({ id, label }) => (
              <li key={id}><Link href={catalogDirectionHref(id)}>{label ?? catalogDirectionById(id).title}<CorporateArrow /></Link></li>
            ))}
          </ul>
          <div className={styles.actions}>
            <Link className="site-button site-button-primary" href="#documentation-request" onClick={() => setSelectedEquipment(activeId)}>
              Запросить документацию <CorporateArrow />
            </Link>
          </div>
        </div>
      </div>
    </section>
    {children}
    <div className={styles.request}>
      <HomeContactForm equipment={equipmentOptions} selectedEquipment={selectedEquipment} onEquipmentChange={setSelectedEquipment} />
    </div>
  </>;
}
