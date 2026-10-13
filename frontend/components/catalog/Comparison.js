'use client';
import { displayProductName, displayExecution } from '@/lib/catalog/presentation';
import { isApiCatalog } from '@/lib/catalog/apiData';
import { LiveComparison } from './LiveCatalog';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { products, categoryName, specRows, valueOrDash, specUnit } from '@/lib/catalog/data';
import { comparisonSpecValue } from '@/lib/catalog/comparison';
import { catalogSpecValueText } from '@/lib/catalog/ptmmDimensionQualification';
import CatalogSpecValue from './CatalogSpecValue';
import { parseComparison } from '@/lib/catalog/query';
import { useSelection } from './SelectionProvider';
import CatalogNotice from './CatalogNotice';
import ProductIcon from './ProductIcon';
function StaticComparison() {
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
  return <div className="catalog-page"><nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog">Каталог</Link><span>/</span><span>Сравнение</span></nav><div className="catalog-heading compact-heading"><div><p className="catalog-kicker">ТЕХНИЧЕСКИЙ КАТАЛОГ</p><h1>Сравнение оборудования</h1></div><Link className="catalog-button" href={`/catalog${ids.length ? `?compare=${ids.join(',')}` : ''}`}>Изменить выбор ↗</Link></div><CatalogNotice compact source={selected.some((product) => product.source === 'demo') ? 'demo' : 'official'} />
    {selected.length < 2 ? <div className="catalog-empty"><h2>Выберите минимум две позиции</h2><p>Сравнивайте до четырёх позиций по техническим параметрам.</p><Link className="catalog-button primary" href={`/catalog${ids.length ? `?compare=${ids.join(',')}` : ''}`}>Выбрать в каталоге</Link></div> : <><div className="comparison-toolbar"><span className="catalog-meta">Выбрано: {selected.length} из 4</span><label className="inline-check"><input type="checkbox" checked={differencesOnly} onChange={(event) => setDifferencesOnly(event.target.checked)}/>Только различия</label></div><div className="comparison-table-wrap" role="region" aria-label="Сравнение параметров, прокрутка по горизонтали" tabIndex={0}><table className="comparison-table"><thead><tr><th scope="col">Параметр</th>{selected.map((product) => <th key={product.id} scope="col"><button className="remove-compare" aria-label={`Убрать ${product.designation || product.sku || product.name} из сравнения`} onClick={() => router.replace(`/catalog/compare?ids=${ids.filter((id) => id !== product.id).join(',')}`)}>×</button><div className="comparison-product-icon"><ProductIcon product={product} size={52}/></div><span className="product-sku">{product.designation || product.sku || product.name}</span><Link href={`/catalog/${product.id}`}>{displayProductName(product)}</Link>{displayExecution(product) && <span className="catalog-meta">{displayExecution(product)}</span>}<button className="catalog-button compact" aria-label={`В подборку ${product.designation || product.sku || product.name}`} onClick={() => { selection.add(product.id); setNotice(`${product.designation || product.sku || product.name} добавлен в подборку`); }}>В подборку +</button></th>)}</tr></thead><tbody>{shown.map((row) => <tr key={row.key} className={differs(row) ? 'has-difference' : ''}><th scope="row" className="catalog-spec-text">{row.label}</th>{values(row).map((value, index) => <td key={ids[index]} className="catalog-spec-text">{row.technical ? <CatalogSpecValue product={selected[index]} row={row} value={value}/> : value}</td>)}</tr>)}</tbody></table></div>{!shown.length && <p className="catalog-empty">В доступных параметрах различий нет.</p>}<p className="filter-help">Подсвечены строки с различающимися значениями. Отсутствие данных не подтверждает техническую совместимость.</p><p role="status" className="catalog-status">{notice}</p></>}
  </div>;
}

export default function Comparison() {
 const params = useSearchParams();
 return isApiCatalog(params) ? <LiveComparison/> : <StaticComparison/>;
}
