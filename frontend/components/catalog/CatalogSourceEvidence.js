'use client';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';

import { useEffect } from 'react';
import Link from '@/components/locale/LocaleLink';
import { getCatalogRelatedReferences, getCatalogSourceComparisons } from '@/lib/catalog/identityCompletion';
import { sourcePageUrl } from '@/lib/catalog/sources';
import { getCatalogFamilySourceReferences, sourcePanelAnchor } from '@/lib/catalog/familySourceReferences';
import { getReviewedLegacyCompletion } from '@/lib/catalog/models/legacyAssetCompletion';
import { displayExecution, displayProductName, displaySpecLabel } from '@/lib/catalog/presentation';
import CatalogConfigurations from './CatalogConfigurations';
import CatalogSourcePreview from './CatalogSourcePreview';

function PageLink({ source, page }) {
  const href = sourcePageUrl(source, page);
  return href ? <Link className="source-page-link" href={href}>стр. {page}</Link> : null;
}
const numericPhysicalField = label => /мощност|напряжени|ток|масс|высот|ширин|длин|диаметр|^[LBHADhlb][0-9₁₂₃]?$/i.test(label);
function Value({ value, unit, label }) {
  if (value === null || value === undefined || value === '') return '—';
  return <>{String(value)}{unit ? ` ${unit}` : numericPhysicalField(label) && /\d/.test(String(value)) ? <small className="source-unit-note">Единица в источнике не указана</small> : ''}</>;
}
function SourceFacts({ source, specs }) {
  return <dl className="technical-specs imported-specs">{specs.map((spec, index) => <div key={index}><dt className="catalog-spec-text">{displaySpecLabel(spec.label)}</dt><dd className="catalog-spec-text"><Value value={spec.value} label={spec.label} unit={spec.unit}/></dd><span><PageLink source={source} page={spec.page}/></span></div>)}</dl>;
}

export default function CatalogSourceEvidence({ product, records = [] }) {
  const panels = getCatalogSourceComparisons(product);
  const familyReferences = getCatalogFamilySourceReferences(product, records);
  const anchorIds = panels.map(panel => sourcePanelAnchor(panel.id)).join('|');
  useEffect(() => {
    // API panels arrive after navigation; scroll only to this record's guarded source anchor.
    const requested = window.location.hash.slice(1);
    if (requested && anchorIds.split('|').includes(requested)) document.getElementById(requested)?.scrollIntoView({ block: 'start' });
  }, [anchorIds]);
  const references = getCatalogRelatedReferences(product).filter(reference => records.some(record => record.id === reference.id));
  const reviewedConstruction = getReviewedLegacyCompletion(product, 'geometry');
  const constructionSource = reviewedConstruction?.sourceUrl && reviewedConstruction.sourceUrl !== product.sourceUrl ? reviewedConstruction.sourceUrl : null;
  if (!panels.length && !references.length && !familyReferences.length && !constructionSource) return null;
  const liveSuffix = product.source === 'api' ? '?source=api' : '';
  return <section className="catalog-source-evidence" aria-label="Источники и связанные записи">
    {!!familyReferences.length && <section className="catalog-family-source-references" aria-label="Сопоставления источников этой серии"><h2>Другие источники по этой серии</h2><p>Эти ссылки открывают сопоставления в существующих карточках. Они не добавляют исполнения в семейство и не подтверждают эквивалентность оборудования.</p><ul>{familyReferences.map(reference => <li key={reference.panelId}><Link href={reference.href} data-source-reference={reference.panelId}>Сопоставление источников: {reference.designation} →</Link></li>)}</ul></section>}
    {constructionSource && <p className="catalog-source-line"><LocalResourceAnchor className="site-text-link" href={constructionSource} target="_blank" rel="noopener noreferrer">Источник сопоставления {product.designation || displayProductName(product)} ↗</LocalResourceAnchor><span>Официальный раздел производителя</span></p>}
    {panels.map(panel => {
      const comparison = panel.comparison || {};
      const compared = comparison.comparedSpecs || [];
      const comparedFields = new Set(compared.map(row => row.field));
      const additionalConflicts = (comparison.conflicts || []).filter(row => !comparedFields.has(row.field));
      return <article id={sourcePanelAnchor(panel.id)} className="catalog-source-panel" data-catalog-source-panel={panel.id} key={panel.id}>
        <p className="catalog-kicker">СВЕДЕНИЯ С УКАЗАНИЕМ ИСТОЧНИКА</p>
        <h2>{panel.representation === 'alias' ? 'Дополнительный источник для этой модели' : 'Сопоставление источников'}</h2>
        <h3>{panel.designation}{displayExecution(panel) ? ` · ${displayExecution(panel)}` : ''}</h3>
        <p className="catalog-data-warning">{panel.representation === 'alias' ? 'Сведения относятся к этой модели. Противоречивые единицы сохранены по каждому источнику; единое нормализованное значение не подставлено.' : 'Источники используют связанное обозначение. Размеры, параметры и комплектация могут относиться к разным исполнениям; их эквивалентность не подтверждена.'} Готовый артикул заказа не подтверждён.</p>
        {!!compared.length && <div className="source-comparison-wrap" role="region" aria-label={`Параметры двух источников: ${panel.designation}`} tabIndex={0}><table className="source-comparison-table"><thead><tr><th scope="col">Параметр</th><th scope="col"><LocalResourceAnchor href={comparison.legacySourceUrl} target="_blank" rel="noopener noreferrer">{comparison.legacySourceTitle || 'Источник основной карточки'} ↗</LocalResourceAnchor></th><th scope="col"><LocalResourceAnchor href={panel.sourceUrl} target="_blank" rel="noopener noreferrer">{panel.sourceTitle} ↗</LocalResourceAnchor></th></tr></thead><tbody>{[...compared, ...additionalConflicts].map((row, index) => {
          const valuesDiffer = row.comparison === 'different' || (row.comparison !== 'match' && String(row.legacySourceValue ?? '') !== String(row.newCatalogValue ?? ''));
          const differs = valuesDiffer || String(row.legacyUnit || '') !== String(row.newUnit || '');
          return <tr key={`${row.field}-${index}`} data-source-field={row.field} className={differs ? 'has-difference' : ''}><th scope="row">{displaySpecLabel(row.label)}{differs && <small className="source-comparison-status">Есть расхождение</small>}</th><td><Value value={row.legacySourceValue} unit={row.legacyUnit} label={row.label}/></td><td><Value value={row.newCatalogValue} unit={row.newUnit} label={row.label}/><PageLink source={panel} page={row.newSourcePage}/></td></tr>;
        })}</tbody></table></div>}
        <div className="catalog-source-line"><LocalResourceAnchor href={panel.sourceUrl} target="_blank" rel="noopener noreferrer">{panel.sourceTitle} ↗</LocalResourceAnchor><span>{panel.sourcePages.map(page => <PageLink key={page} source={panel} page={page}/>)}</span></div>
        <CatalogSourcePreview product={product} panelId={panel.id}/>
        <details className="catalog-source-facts"><summary>Все характеристики этой записи в печатном каталоге</summary><SourceFacts source={panel} specs={panel.technicalSpecs || []}/><CatalogConfigurations product={panel}/></details>
        {(panel.description || panel.familySpecs?.length > 0) && <details className="catalog-source-facts"><summary>Общие сведения серии из печатного каталога</summary><p className="filter-help">Эти сведения описывают серию и её варианты. Климатические диапазоны и опции не приписываются одному конкретному исполнению.</p>{panel.description && <p>{panel.description}</p>}<SourceFacts source={panel} specs={panel.familySpecs || []}/></details>}
        {!!panel.notes?.length && <details className="catalog-data-warning"><summary>Примечания этого источника ({panel.notes.length})</summary><ul>{panel.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details>}
      </article>;
    })}
    {!!references.length && <section className="catalog-related-references"><h2>Связанные записи каталога</h2><p>Обозначения связаны документально. Это отдельные записи; совпадение конкретного исполнения и взаимозаменяемость не подтверждены.</p><ul>{references.map(reference => <li key={reference.id}><Link href={`/catalog/${reference.id}${liveSuffix}`}>{displayProductName(reference)} →</Link></li>)}</ul></section>}
  </section>;
}
