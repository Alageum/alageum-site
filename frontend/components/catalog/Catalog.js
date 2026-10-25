'use client';import LocaleElement from "@/components/locale/LocaleElement";
import { displayProductName, displayExecution, displaySubtype, displayExecutionValue, catalogSourceWarnings } from '@/lib/catalog/presentation';
import SelectionIndicator from '@/components/ui/SelectionIndicator';
import QuickProductDetails from './QuickProductDetails';
import ParametricFilters from './ParametricFilters';
import SearchHistory, {saveSearch} from './SearchHistory';
import { filterAdvancedProducts as filterProducts, advancedFacetKeys, readFacetSelection } from '@/lib/catalog/advancedQuery';
import { useTranslate } from '@/components/locale/LocaleProvider';
import './ParametricCatalog.css';
import { isApiCatalog } from '@/lib/catalog/apiData';
import { LiveCatalog } from './LiveCatalog';

import Link from "@/components/locale/LocaleLink";
import { Fragment, useEffect, useState } from 'react';
import { useUrlComparison } from './useUrlComparison';
import { useSearchParams } from 'next/navigation';import { usePathname, useRouter } from "@/components/locale/navigation";
import { categories, products as allProducts, demoProducts, officialProducts, valueOrDash, recordKindLabel } from '@/lib/catalog/data';
import { sortProducts, paginationWindow } from '@/lib/catalog/query';
import { loadApiCatalog } from '@/lib/catalog/source';
import { useSelection } from './SelectionProvider';
import CatalogNotice from './CatalogNotice';
import EquipmentIcon from './EquipmentIcon';
import { ProductThumbnail } from './ProductPhotograph';
import { equipmentTypeFor, categorySpecRows, categoryDisplayRows, getCatalogSpecSummary, compactCatalogSpecValue, facetValues, equipmentTypes } from '@/lib/catalog/grouping';
import { equipmentModelName } from '@/lib/catalog/models/types';

function MediaFilters({params,update}){const [flags,setFlags]=useState({hasPhoto:params.hasPhoto||'',has3d:params.has3d||''});return <LocaleElement as="div" className="parametric-media-controls" role="group" aria-label="Материалы оборудования">{[['hasPhoto','С фотографией'],['has3d','С 3D-моделью']].map(([key,label])=><LocaleElement as="label" className="parametric-media-check" key={key}><SelectionIndicator checked={flags[key]==='1'} onChange={event=>{const next={...flags,[key]:event.target.checked?'1':''};setFlags(next);update(next);}}/><LocaleElement as="span">{label}</LocaleElement></LocaleElement>)}<LocaleElement as="span" className="parametric-media-note">3D — иллюстрация конструкции, не CAD.</LocaleElement></LocaleElement>;}

function SearchSpecValue({value}) {const text=String(value??'—');return text.length>75?<><LocaleElement as="span" className="parametric-spec-preview">{text}</LocaleElement><LocaleElement as="details" className="parametric-spec-details"><LocaleElement as="summary">Все значения</LocaleElement><LocaleElement as="p">{text}</LocaleElement></LocaleElement></>:<LocaleElement as="span">{text}</LocaleElement>;}

const demoFacets = [
{ key: 'power', label: 'Мощность, кВА' }, { key: 'voltage', label: 'Напряжение (единицы в значении)' },
{ key: 'cooling', label: 'Охлаждение' }, { key: 'installation', label: 'Установка' }];


function StaticCatalog() {
  const router = useRouter();
  const tx = useTranslate();
  const [categorySearch, setCategorySearch] = useState('');
  const [compact, setCompact] = useState(true);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = Object.fromEntries(searchParams);
  const [expanded,setExpanded]=useState(null);
  const rowContext=[...searchParams].filter(([key])=>key!=='compare').map(([key,value])=>`${key}=${value}`).join('&');
  const expandedId=expanded?.context===rowContext?expanded.id:'';
  function toggleDetails(id){setExpanded({context:rowContext,id:expandedId===id?'':id});}
  const apiMode = params.source === 'api';
  const demoMode = params.source === 'demo';
  const [remote, setRemote] = useState({ items: [], status: 'loading', error: '' });
  const [retry, setRetry] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const selection = useSelection();
  useEffect(() => {
    if (!apiMode) return;
    let active = true;
    loadApiCatalog().then((items) => {if (active) setRemote({ items, status: 'ready', error: '' });}).catch((error) => {if (active) setRemote({ items: [], status: 'error', error: error.message });});
    return () => {active = false;};
  }, [apiMode, retry]);
  const products = apiMode ? remote.items : demoMode ? demoProducts : officialProducts;
  const facets = demoMode || apiMode ? demoFacets : params.category ? categorySpecRows(params.category) : [...new Map(['transformers', 'substations', 'switchgear', 'cabinets', 'protection'].flatMap(categorySpecRows).map((row) => [row.key, row])).values()];
  const columns = demoMode || apiMode ? demoFacets.slice(0, 3) : categoryDisplayRows(params.category);
  const results = sortProducts(filterProducts(products, params), params.sort);
  const PAGE_SIZE = [12,24,48].includes(Number(params.pageSize)) ? Number(params.pageSize) : 12;
  const pageCount = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Number.parseInt(params.page || '1', 10) || 1));
  const visible = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const [selected, setSelected] = useUrlComparison(params.compare, allProducts);
  const activeFilters = ['hasPhoto','has3d','q', 'category', 'recordKind', 'equipmentType', 'power', 'voltage', 'cooling', 'installation', 'current', 'subtype', 'function', ...advancedFacetKeys.map(key=>`f_${key}`)].filter((key) => params[key]);
  function update(changes, replace = false) {
    const next = new URLSearchParams(replace ? window.location.search : searchParams);
    if (!Object.hasOwn(changes, 'page')) next.delete('page');
    if (Object.hasOwn(changes,'category') || Object.hasOwn(changes,'equipmentType')) advancedFacetKeys.forEach(key=>next.delete(`f_${key}`));
    Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key));
    const query = next.toString();
    const href = `${pathname}${query ? `?${query}` : ''}`;
    if (replace) window.history.replaceState(null, '', href);else
    router.push(href, { scroll: false });
  }
  function toggleCompare(id) {
    if (!selected.includes(id) && selected.length >= 4) {setNotice('Для сравнения можно выбрать до 4 позиций. Уберите одну, чтобы добавить другую.');return;}
    setNotice('');
    const next = selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id];
    setSelected(next);
    update({ compare: next.join(',') }, true);
  }
  function resetFilters() {update(Object.fromEntries(activeFilters.map((key) => [key, ''])));}
  function add(product) {selection.add(product.id);setNotice(`${product.designation || product.sku || product.name} добавлен в подборку. Это локальный список, не заказ.`);}
  return <LocaleElement as="div" className={`catalog-page parametric-catalog${compact ? ' is-compact' : ''}`}>
    <LocaleElement as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog/home">Каталог оборудования</Link><LocaleElement as="span" aria-hidden="true">/</LocaleElement><LocaleElement as="span">Каталог</LocaleElement></LocaleElement>
    <LocaleElement as="div" className="catalog-heading"><LocaleElement as="div"><LocaleElement as="p" className="catalog-kicker">КАТАЛОГ / ПАРАМЕТРИЧЕСКИЙ ПОИСК</LocaleElement><LocaleElement as="h1">{params.category ? categories.find(category=>category.id===params.category)?.name || 'Оборудование' : 'Каталог оборудования'}</LocaleElement></LocaleElement><LocaleElement as="p">Найдите, сравните и сохраните оборудование для проекта.</LocaleElement></LocaleElement>
    {apiMode ? <LocaleElement as="div" className="catalog-notice"><LocaleElement as="span" className="notice-mark">i</LocaleElement><LocaleElement as="div"><LocaleElement as="strong">Режим Backend API</LocaleElement><LocaleElement as="span"> Данные из существующего API. Сопоставление технических полей и подборка для API-позиций ещё не согласованы.</LocaleElement></LocaleElement></LocaleElement> : <CatalogNotice compact source={demoMode ? 'demo' : 'official'} />}
    <LocaleElement as="form" className="catalog-search" onSubmit={(event) => {event.preventDefault();const data=new FormData(event.currentTarget);saveSearch(data.get('q'));update({ q: data.get('q').trim(), searchMode: data.get('searchMode') });}} role="search">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.5" /><path d="m16 16 4.5 4.5" stroke="currentColor" strokeWidth="1.5" /></svg>
      <LocaleElement as="input" key={params.q || ''} name="q" type="search" aria-label="Поиск по каталогу" defaultValue={params.q || ''} placeholder="Наименование, артикул или параметр оборудования" maxLength={200} />
      <LocaleElement as="select" name="searchMode" aria-label="Режим поиска" defaultValue={params.searchMode||'all'} key={params.searchMode||'all'}><LocaleElement as="option" value="all">Все слова</LocaleElement><LocaleElement as="option" value="exact">Точное обозначение</LocaleElement></LocaleElement><LocaleElement as="button" type="submit" className="catalog-button primary">Найти <LocaleElement as="span" aria-hidden="true">→</LocaleElement></LocaleElement>
    </LocaleElement>
    <SearchHistory onSelect={q=>update({q})}/>
    <LocaleElement as="div" className="parametric-search-help"><LocaleElement as="span">Поиск по обозначению, описанию и параметрам. Например: «630 кВА» или «10 кВ».</LocaleElement>{params.category && <LocaleElement as="button" className="text-button" onClick={()=>update({category:'',equipmentType:''})}>Искать во всех категориях →</LocaleElement>}</LocaleElement>
    <LocaleElement as="div" className="catalog-workspace">
      <LocaleElement as="button" type="button" className="catalog-button filter-toggle" aria-expanded={filtersOpen} aria-controls="catalog-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Параметры и категории {activeFilters.length ? `(${activeFilters.length})` : ''}<LocaleElement as="span" aria-hidden="true">{filtersOpen ? '−' : '+'}</LocaleElement></LocaleElement>
      <LocaleElement as="aside" id="catalog-filters" className={`catalog-filters${filtersOpen ? ' is-open' : ''}`} aria-label="Фильтры каталога">
        <LocaleElement as="div" className="filter-title"><LocaleElement as="h2">Категории</LocaleElement><LocaleElement as="span" className="catalog-meta">{products.length}</LocaleElement></LocaleElement>
        <LocaleElement as="input" type="search" className="parametric-category-search" placeholder="Найти категорию" aria-label="Найти категорию" value={categorySearch} onChange={event=>setCategorySearch(event.target.value)}/>
        <LocaleElement as="div" className="category-options"><LocaleElement as="button" className={!params.category ? 'is-active' : ''} onClick={() => update({ category: '', equipmentType: '', power: '', voltage: '', cooling: '', installation: '', current: '', subtype: '', function: '' })} aria-pressed={!params.category}>Все оборудование <LocaleElement as="span">{products.length}</LocaleElement></LocaleElement>
          {!apiMode && categories.filter(category=>`${category.name} ${tx(category.name)}`.toLowerCase().includes(categorySearch.toLowerCase())).map((category) => <LocaleElement as="div" className="category-tree-group" key={category.id}><LocaleElement as="button" aria-pressed={params.category === category.id && !params.equipmentType} className={params.category === category.id ? 'is-active' : ''} onClick={() => update({ category: category.id, equipmentType: '', power: '', voltage: '', cooling: '', installation: '', current: '', subtype: '', function: '' })}>{category.name}<LocaleElement as="span">{products.filter((product) => product.category === category.id).length}</LocaleElement></LocaleElement>{!demoMode && params.category === category.id && <LocaleElement as="div" className="category-subtypes" aria-label={`Подкатегории: ${category.name}`}>{equipmentTypes.map((type) => type.id).filter((type) => products.some((product) => product.category === category.id && equipmentTypeFor(product) === type)).map((type) => <LocaleElement as="button" key={type} aria-pressed={params.equipmentType === type} className={params.equipmentType === type ? 'is-active' : ''} onClick={() => update({ equipmentType: params.equipmentType === type ? '' : type })}><EquipmentIcon type={type} size={25} /><LocaleElement as="span">{equipmentTypes.find((entry) => entry.id === type)?.name || equipmentModelName(type)}</LocaleElement><LocaleElement as="small">{products.filter((product) => product.category === category.id && equipmentTypeFor(product) === type).length}</LocaleElement></LocaleElement>)}</LocaleElement>}</LocaleElement>)}
        </LocaleElement>
        {!apiMode && <><LocaleElement as="div" className="filter-title parameter-title"><LocaleElement as="h2">Условия поиска</LocaleElement><LocaleElement as="button" type="button" className="text-button" onClick={resetFilters} disabled={!activeFilters.length}>Сбросить</LocaleElement></LocaleElement>
          {!demoMode && <LocaleElement as="label" className="catalog-field"><LocaleElement as="span" id="filter-record-kind-label">Тип записи</LocaleElement><LocaleElement as="select" aria-labelledby="filter-record-kind-label" value={params.recordKind || ''} onChange={(event) => update({ recordKind: event.target.value })}><LocaleElement as="option" value="">Серии и модели</LocaleElement><LocaleElement as="option" value="family">Только серии / семейства</LocaleElement><LocaleElement as="option" value="variant">Модели из таблиц</LocaleElement></LocaleElement></LocaleElement>}<LocaleElement as="p" className="filter-help">«—» означает: параметр не подтверждён.<br />Варианты напряжения уточняются по исполнению.</LocaleElement></>}
        <LocaleElement as="div" className="source-note"><LocaleElement as="span" className="catalog-meta">ИСТОЧНИК ДАННЫХ</LocaleElement><LocaleElement as="strong">{apiMode ? 'Существующий API' : demoMode ? `Демо-набор · ${demoProducts.length} позиций` : `Официальный каталог · ${officialProducts.length} позиций`}</LocaleElement><Link href={demoMode || apiMode ? '/catalog' : '/documents'}>{demoMode || apiMode ? 'Открыть публичный каталог' : 'Источники и документы'} <LocaleElement as="span" aria-hidden="true">↗</LocaleElement></Link></LocaleElement>
      </LocaleElement>
      <LocaleElement as="section" className="catalog-results" aria-label="Результаты каталога">
        {!apiMode && <ParametricFilters facets={facets} products={products} params={params} update={update}/>}
        {!apiMode && <MediaFilters key={`${params.hasPhoto||''}:${params.has3d||''}`} params={params} update={update}/>}
        <LocaleElement as="div" className="parametric-view-controls"><LocaleElement as="label">На странице <LocaleElement as="select" aria-label="Позиций на странице" value={String(PAGE_SIZE)} onChange={event=>update({pageSize:event.target.value})}>{[12,24,48].map(size=><option key={size} value={size}>{size}</option>)}</LocaleElement></LocaleElement><LocaleElement as="button" type="button" aria-pressed={compact} onClick={()=>setCompact(!compact)}>Компактные строки</LocaleElement></LocaleElement>
        <LocaleElement as="div" className="results-toolbar"><LocaleElement as="div"><LocaleElement as="h2">{params.category ? categories.find((entry) => entry.id === params.category)?.name || 'Результаты' : 'Все оборудование'}</LocaleElement><LocaleElement as="span" className="catalog-meta" role="status">Найдено: {results.length}</LocaleElement></LocaleElement><LocaleElement as="label" className="sort-control"><LocaleElement as="span">Сортировка</LocaleElement><LocaleElement as="select" aria-label="Сортировка" value={params.sort || 'name'} onChange={(event) => update({ sort: event.target.value })}><LocaleElement as="option" value="name">По наименованию</LocaleElement><LocaleElement as="option" value="power-asc">Мощность: по возрастанию</LocaleElement><LocaleElement as="option" value="power-desc">Мощность: по убыванию</LocaleElement></LocaleElement></LocaleElement></LocaleElement>
        {!apiMode && !demoMode && <LocaleElement as="p" className="catalog-icon-legend">Иконки передают общую форму серии. <LocaleElement as="span">≈</LocaleElement> — условная схема типа без подтверждённого вида исполнения.</LocaleElement>}
        {activeFilters.length > 0 && <LocaleElement as="div" className="active-filters" aria-label="Активные фильтры">{activeFilters.map((key) => <LocaleElement as="button" key={key} onClick={() => update({ [key]: '' })} aria-label={`Убрать фильтр ${params[key]}`}>{key==='hasPhoto' ? tx('С фотографией') : key==='has3d' ? tx('С 3D-моделью') : key.startsWith('f_') ? `${tx(key==='f_manufacturer'?'Производитель':facets.find(facet=>`f_${facet.key}`===key)?.label||key.slice(2))}: ${readFacetSelection(params[key]).map(displayExecutionValue).join(' / ')}` : key === 'category' ? categories.find((entry) => entry.id === params[key])?.name || params[key] : key === 'equipmentType' ? equipmentModelName(params[key]) : displayExecutionValue(params[key])} <LocaleElement as="span" aria-hidden="true">×</LocaleElement></LocaleElement>)}<LocaleElement as="button" className="reset-all" onClick={resetFilters}>Сбросить все</LocaleElement></LocaleElement>}
        {apiMode && remote.status === 'loading' ? <LocaleElement as="div" className="catalog-empty" role="status"><LocaleElement as="h3">Загрузка из API…</LocaleElement><LocaleElement as="p">Ожидаем ответ существующего сервера каталога.</LocaleElement></LocaleElement> : apiMode && remote.status === 'error' ? <LocaleElement as="div" className="catalog-empty" role="alert"><LocaleElement as="span" className="empty-icon">!</LocaleElement><LocaleElement as="h3">Не удалось загрузить каталог</LocaleElement><LocaleElement as="p">Проверьте, запущен ли backend и настроен ли NEXT_PUBLIC_API_URL. Демо-данные не подменяют ответ сервера.</LocaleElement><LocaleElement as="p" className="catalog-meta">{remote.error}</LocaleElement><LocaleElement as="div" className="inline-actions"><LocaleElement as="button" className="catalog-button" onClick={() => {setRemote({ items: [], status: 'loading', error: '' });setRetry(retry + 1);}}>Повторить</LocaleElement><Link className="catalog-button primary" href="/catalog">Открыть публичный каталог</Link></LocaleElement></LocaleElement> : visible.length === 0 ? <LocaleElement as="div" className="catalog-empty"><LocaleElement as="span" className="empty-icon" aria-hidden="true">⌕</LocaleElement><LocaleElement as="h3">По этим параметрам ничего не найдено</LocaleElement><LocaleElement as="p">Измените запрос или уберите часть фильтров.</LocaleElement><LocaleElement as="button" className="catalog-button" onClick={resetFilters}>Сбросить фильтры</LocaleElement></LocaleElement> : <>
          <LocaleElement as="p" className="catalog-scroll-hint">Прокрутите таблицу вбок, чтобы увидеть все параметры →</LocaleElement><LocaleElement as="div" className="catalog-table-wrap" tabIndex={0} role="region" aria-label="Таблица оборудования, прокрутка по горизонтали"><LocaleElement as="table" className="catalog-table"><LocaleElement as="thead"><LocaleElement as="tr"><LocaleElement as="th" scope="col"><LocaleElement as="span" className="sr-only">Выбор для сравнения</LocaleElement></LocaleElement><LocaleElement as="th" scope="col">Оборудование / обозначение</LocaleElement><>{columns.map((column) => <LocaleElement as="th" scope="col" key={column.key}>{column.label}{column.unit && (demoMode || apiMode) && <><br /><LocaleElement as="span">{column.unit}</LocaleElement></>}</LocaleElement>)}</><LocaleElement as="th" scope="col"><LocaleElement as="span" className="sr-only">Действия</LocaleElement></LocaleElement></LocaleElement></LocaleElement><LocaleElement as="tbody">{visible.map((product) => <Fragment key={product.id}><LocaleElement as="tr" data-product-id={product.id} className={selected.includes(product.id) ? 'is-selected' : ''} onClick={(event) => {if (!apiMode && !event.target.closest('a,button,input,label,select')) toggleCompare(product.id);}}><LocaleElement as="td"><SelectionIndicator aria-label={`${tx('Сравнить')} ${product.designation || product.sku || product.name}`} checked={selected.includes(product.id)} onChange={() => toggleCompare(product.id)} disabled={apiMode}/></LocaleElement><LocaleElement as="td"><LocaleElement as="div" className="product-cell"><ProductThumbnail product={product} /><LocaleElement as="div"><Link className="product-name" href={`/catalog/${product.id}${apiMode ? '?source=api' : ''}`}>{displayProductName(product)}</Link><LocaleElement as="div" className="product-note"><LocaleElement as="span" className="product-sku">{product.designation || product.sku || 'Обозначение не указано'}</LocaleElement><LocaleElement as="span" className="catalog-meta">{displayExecution(product)}</LocaleElement>{catalogSourceWarnings(product, officialProducts).length > 0 && <LocaleElement as="span" className="catalog-meta">Есть примечания и ограничения источника</LocaleElement>}<LocaleElement as="span" className="product-kind">{apiMode ? 'Из API' : product.source === 'demo' ? 'Синтетический пример' : `${recordKindLabel(product)} · ${displaySubtype(product) || 'Каталог'}`}</LocaleElement></LocaleElement></LocaleElement></LocaleElement></LocaleElement>{columns.map((column) => <LocaleElement as="td" className="numeric-cell" key={column.key}><SearchSpecValue value={demoMode || apiMode ? valueOrDash(product[column.key], column.key === 'voltage' ? product.voltageUnit ?? 'кВ' : '') : compactCatalogSpecValue(getCatalogSpecSummary(product, officialProducts, params.category || '').find((row) => row.key === column.key))}/></LocaleElement>)}<LocaleElement as="td"><LocaleElement as="div" className="row-actions"><LocaleElement as="button" className="catalog-button compact" onClick={() => add(product)} disabled={apiMode} aria-label={`В подборку ${product.designation || product.sku || product.name}`}>В подборку <LocaleElement as="span" aria-hidden="true">+</LocaleElement></LocaleElement>{!apiMode ? <LocaleElement as="button" className="quick-spec-toggle" type="button" aria-expanded={expandedId===product.id} aria-controls={`quick-specs-${product.id}`} onClick={()=>toggleDetails(product.id)}>Характеристики <LocaleElement as="span" aria-hidden="true">{expandedId===product.id?'−':'+'}</LocaleElement></LocaleElement> : <Link href={`/catalog/${product.id}?source=api`}>Характеристики ↗</Link>}</LocaleElement></LocaleElement></LocaleElement>{expandedId===product.id&&<LocaleElement as="tr" className="quick-product-row"><LocaleElement as="td" colSpan={columns.length+3}><QuickProductDetails product={product} onClose={()=>setExpanded(null)}/></LocaleElement></LocaleElement>}</Fragment>)}</LocaleElement></LocaleElement></LocaleElement>
          <LocaleElement as="div" className="catalog-pagination"><LocaleElement as="span" className="catalog-meta">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, results.length)} из {results.length} позиций</LocaleElement><LocaleElement as="nav" aria-label="Страницы каталога"><LocaleElement as="button" aria-label="Предыдущая страница" disabled={page === 1} onClick={() => update({ page: String(page - 1) })}>←</LocaleElement>{paginationWindow(page, pageCount).map((number, index) => number === null ? <LocaleElement as="span" className="pagination-gap" key={`gap-${index}`}>…</LocaleElement> : <LocaleElement as="button" key={number} aria-current={page === number ? 'page' : undefined} onClick={() => update({ page: String(number) })}>{number}</LocaleElement>)}<LocaleElement as="button" aria-label="Следующая страница" disabled={page === pageCount} onClick={() => update({ page: String(page + 1) })}>→</LocaleElement></LocaleElement></LocaleElement>
        </>}
        <LocaleElement as="p" className="catalog-status" role="status" aria-live="polite">{notice}</LocaleElement>
      </LocaleElement>
    </LocaleElement>
    {selected.length > 0 && !apiMode && <LocaleElement as="div" className="comparison-tray"><LocaleElement as="div"><LocaleElement as="span" className="catalog-kicker">СРАВНЕНИЕ</LocaleElement><LocaleElement as="strong">{selected.length} из 4 позиций</LocaleElement></LocaleElement><LocaleElement as="div" className="compare-skus">{selected.map((id) => <LocaleElement as="button" key={id} onClick={() => toggleCompare(id)} aria-label={`Убрать ${allProducts.find((product) => product.id === id).sku} из сравнения`}>{allProducts.find((product) => product.id === id).sku} <LocaleElement as="span" aria-hidden="true">×</LocaleElement></LocaleElement>)}</LocaleElement><LocaleElement as="button" className="text-button" onClick={() => update({ compare: '' }, true)}>Очистить</LocaleElement>{selected.length >= 2 ? <Link className="catalog-button primary" href={`/catalog/compare?ids=${selected.join(',')}`}>Сравнить ({selected.length}) <LocaleElement as="span" aria-hidden="true">→</LocaleElement></Link> : <LocaleElement as="span" className="compare-hint">Выберите ещё одну позицию</LocaleElement>}</LocaleElement>}
  </LocaleElement>;
}

export default function Catalog() {
  const params = useSearchParams();
  return isApiCatalog(params) ? <LiveCatalog /> : <StaticCatalog />;
}
