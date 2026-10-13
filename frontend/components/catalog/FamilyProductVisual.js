'use client';
import DesignSelect from '@/components/ui/DesignSelect';

import { useState } from 'react';
import Link from '@/components/locale/LocaleLink';
import Image from 'next/image';
import { getFamilyTechnicalDocument } from '@/lib/catalog/familyPresentation';
import ProductVisual from './ProductVisual';
import ProductIcon from './ProductIcon';
import { catalogFamilyMembers, catalogMemberLabel, displayExecution, displayProductName, isCatalogFamily } from '@/lib/catalog/presentation';
import { getCatalogSpecSummary } from '@/lib/catalog/grouping';
import { sourcePageUrl } from '@/lib/catalog/sources';

export default function FamilyProductVisual({ product, records }) {
  const [selectedId, setSelectedId] = useState('');
  const members = catalogFamilyMembers(product, records);
  const selected = members.find(member => member.id === selectedId);
  const document = getFamilyTechnicalDocument(product);
  const overview = document ? <div className="family-source-document" data-family-document-page={document.page}><Link href={document.href}><Image src={document.image} alt={document.caption} width={520} height={440}/></Link><p>{document.caption}</p><Link href={document.href}>Открыть техническую страницу {document.page} →</Link><div className="family-member-source">{product.sourcePages.map(page => <Link key={page} href={sourcePageUrl(product, page)}>{page === 166 ? 'Обзор завода · стр. 166' : `стр. ${page}`}</Link>)}</div></div> : <ProductVisual product={product}/>;
  if (!isCatalogFamily(product) || !members.length) return overview;
  return <section className="family-evidence-preview" aria-label="Обзор семейства и выбранная запись">
    <div className="family-evidence-controls">
      <h2>Обзор семейства</h2>
      <p>Выберите конкретную запись каталога. Её параметры и иллюстрация относятся только к этой записи.</p>
      <label className="catalog-field"><span>Запись для просмотра</span><DesignSelect aria-label="Запись для просмотра" value={selected?.id || ''} onChange={event => setSelectedId(event.target.value)}>
        <option value="">Обзор семейства · запись не выбрана</option>
        {members.map(member => <option key={member.id} value={member.id}>{catalogMemberLabel(member)}</option>)}
      </DesignSelect></label>
    </div>
    {selected ? <div className="family-selected-record" data-selected-member={selected.id}>
      <div className="family-selected-heading"><ProductIcon product={selected} size={40}/><div><strong>{displayProductName(selected)}</strong>{displayExecution(selected) && <p>{displayExecution(selected)}</p>}</div></div>
      <dl className="member-evidence-specs">{getCatalogSpecSummary(selected).filter(row => row.value !== '—').map(row => <div key={row.key}><dt>{row.label}</dt><dd>{row.value}</dd></div>)}</dl>
      {!!selected.notes?.length && <details className="catalog-data-warning"><summary>Ограничения выбранной записи ({selected.notes.length})</summary><ul>{selected.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
      <ProductVisual key={selected.id} product={selected}/>
      <div className="family-member-source">{selected.sourcePages?.map(page => <Link key={page} href={sourcePageUrl(selected, page)}>стр. {page}</Link>)}</div>
      <Link className="catalog-button" href={`/catalog/${selected.id}${selected.source === 'api' ? '?source=api' : ''}`}>Открыть отдельную карточку →</Link>
    </div> : <><p className="visual-mapping-note">Показан источник семейства. Исполнение не выбрано.</p>{overview}</>}
  </section>;
}
