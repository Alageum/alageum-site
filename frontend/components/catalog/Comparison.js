'use client';
import E from '@/components/locale/LocaleElement';
import { useTranslate } from '@/components/locale/LocaleProvider';
import { displayProductName, displayExecution } from '@/lib/catalog/presentation';
import { isApiCatalog } from '@/lib/catalog/apiData';
import { LiveComparison } from './LiveCatalog';
import Link from '@/components/locale/LocaleLink';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/components/locale/navigation';
import { products, categoryName, specRows, valueOrDash, specUnit } from '@/lib/catalog/data';
import { comparisonSpecValue } from '@/lib/catalog/comparison';
import { catalogSpecValueText } from '@/lib/catalog/ptmmDimensionQualification';
import CatalogSpecValue from './CatalogSpecValue';
import { parseComparison } from '@/lib/catalog/query';
import { useSelection } from './SelectionProvider';
import CatalogNotice from './CatalogNotice';
import ProductIcon from './ProductIcon';
function StaticComparison() {
  const tx = useTranslate();
  const params = useSearchParams();
  const router = useRouter();
  const [differencesOnly, setDifferencesOnly] = useState(false);
  const [notice, setNotice] = useState('');
  const selection = useSelection();
  const ids = parseComparison(params.get('ids'), products);
  const selected = ids.map((id) => products.find((product) => product.id === id));
  const detailRows = [...new Map(selected.flatMap(product => (product.technicalSpecs || []).map(spec => [`${spec.label}|${spec.unit}`, { key: `detail:${spec.label}|${spec.unit}`, label: spec.label, unit: spec.unit, technical: true }]))).values()];
  const rows = [{ key: 'category', label: 'Категория' }, ...specRows, ...detailRows];
  const values = (row) => selected.map((product) => row.technical ? comparisonSpecValue(product.technicalSpecs, row, valueOrDash) : row.key === 'category' ? categoryName(product.category) : valueOrDash(product[row.key], specUnit(product, row)));
  const differs = row => new Set(values(row).map((value, index) => row.technical ? catalogSpecValueText(selected[index], row, value) : value)).size > 1;
  const shown = rows.filter((row) => !differencesOnly || differs(row));
  return <div className="catalog-page catalog-comparison"><E as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog">Каталог</Link><E as="span">/</E><E as="span">Сравнение</E></E><div className="catalog-heading compact-heading"><div><E as="p" className="catalog-kicker">ТЕХНИЧЕСКИЙ КАТАЛОГ</E><E as="h1">Сравнение оборудования</E></div><Link className="catalog-button" href={`/catalog${ids.length ? `?compare=${ids.join(',')}` : ''}`}>Изменить выбор ↗</Link></div><CatalogNotice compact source={selected.some((product) => product.source === 'demo') ? 'demo' : 'official'} />
    {selected.length < 2 ? <div className="catalog-empty"><E as="h2">Выберите минимум две позиции</E><E as="p">Сравнивайте до четырёх позиций по техническим параметрам.</E><Link className="catalog-button primary" href={`/catalog${ids.length ? `?compare=${ids.join(',')}` : ''}`}>Выбрать в каталоге</Link></div> : <><div className="comparison-toolbar"><E as="span" className="catalog-meta">Выбрано: {selected.length} из 4</E><E as="label" className="inline-check"><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)}/>Только различия</E></div><div className="comparison-table-wrap" role="region" aria-label="Сравнение параметров, прокрутка по горизонтали" tabIndex={0}><table className="comparison-table"><thead><tr><E as="th" scope="col">Параметр</E>{selected.map((product) => <E as="th" key={product.id} scope="col"><E as="button" className="remove-compare" aria-label={`${tx('Удалить')} ${tx(product.designation || product.sku || product.name)}`} onClick={() => router.replace(`/catalog/compare?ids=${ids.filter((id) => id !== product.id).join(',')}`)}>×</E><div className="comparison-product-icon"><ProductIcon product={product} size={52}/></div><E as="span" className="product-sku">{product.designation || product.sku || product.name}</E><Link href={`/catalog/${product.id}`}>{displayProductName(product)}</Link>{displayExecution(product) && <E as="span" className="catalog-meta">{displayExecution(product)}</E>}<E as="button" className="catalog-button compact" aria-label={`${tx('В подборку')} ${tx(product.designation || product.sku || product.name)}`} onClick={() => { selection.add(product.id); setNotice(`${tx(product.designation || product.sku || product.name)} — ${tx('Оборудование добавлено в подборку')}`); }}>В подборку +</E></E>)}</tr></thead><tbody>{shown.map((row) => <tr key={row.key} className={differs(row) ? 'has-difference' : ''}><E as="th" scope="row" className="catalog-spec-text">{row.label}</E>{values(row).map((value, index) => <E as="td" key={ids[index]} className="catalog-spec-text">{row.technical ? <CatalogSpecValue product={selected[index]} row={row} value={value}/> : value}</E>)}</tr>)}</tbody></table></div>{!shown.length && <E as="p" className="catalog-empty">В доступных параметрах различий нет.</E>}<E as="p" className="filter-help">Подсвечены строки с различающимися значениями. Отсутствие данных не подтверждает техническую совместимость.</E><E as="p" role="status" className="catalog-status">{notice}</E></>}
  </div>;
}

export default function Comparison() {
 const params = useSearchParams();
 return isApiCatalog(params) ? <LiveComparison/> : <StaticComparison/>;
}
