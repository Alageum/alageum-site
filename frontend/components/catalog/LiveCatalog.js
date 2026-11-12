'use client';
import { sourcePageUrl } from '@/lib/catalog/sources';
import E from '@/components/locale/LocaleElement';
import { useTranslate } from '@/components/locale/LocaleProvider';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import Link from '@/components/locale/LocaleLink';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useRouter } from '@/components/locale/navigation';
import { loadApiCatalog } from '@/lib/catalog/source';
import { liveHref } from '@/lib/catalog/apiData';
import { catalogPrice } from '@/lib/catalog/admin';
import { parseComparison, selectionCsv } from '@/lib/catalog/query';
import { comparisonSpecValue } from '@/lib/catalog/comparison';
import ProductIcon from './ProductIcon';
import ProductPhotoVisual from './ProductPhotoVisual';
import { ProductOverview, productCatalogHref } from './ProductOverview';
import ProductSpecificationRows from './ProductSpecificationRows';
import CatalogConfigurations from './CatalogConfigurations';
import CatalogSpecValue from './CatalogSpecValue';
import CatalogSourceEvidence from './CatalogSourceEvidence';
import { getApiCatalogReadProduct } from '@/lib/catalog/identityCompletion';
import { catalogFamilyMembers, catalogMemberLabel, displayDescription, displayExecution, displayFamilyName, displayProductName, catalogSourceWarnings, isCatalogFamily } from '@/lib/catalog/presentation';
import { getCatalogSpecSummary } from '@/lib/catalog/grouping';
import { useApiSelection } from './ApiSelectionProvider';
import { useUrlComparison } from './useUrlComparison';

function useLiveProducts() {
 const [data,setData]=useState({status:'loading',items:[],error:''});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;loadApiCatalog().then(items=>{if(active)setData({status:'ready',items,error:''});}).catch(error=>{if(active)setData({status:'error',items:[],error:error.message});});return()=>{active=false;};},[attempt]);
 return {...data,retry:()=>{setData({status:'loading',items:[],error:''});setAttempt(value=>value+1);}};
}
function LiveStatus({data}) {
 return data.status==='loading'?<E as="p" className="catalog-loading" role="status">Загрузка актуальных данных…</E>:data.status==='error'?<div className="catalog-empty" role="alert" aria-label="Ошибка каталога"><E as="h2">Сервер каталога недоступен</E><E as="p">Актуальные товары и цены не удалось получить.</E><E as="p">{data.error}</E><div className="inline-actions"><E as="button" className="catalog-button" onClick={data.retry}>Повторить</E>{process.env.NEXT_PUBLIC_CATALOG_SOURCE !== 'api' && <Link href="/catalog?source=static">Справочный статический каталог</Link>}</div></div>:null;
}
function LiveNotice(){return <E as="p" className="catalog-notice">Цены указаны в валюте каждой позиции. Наличие и условия поставки уточняются.</E>;}
function AddButton({product,onAdded,primary=false}) {const selection=useApiSelection();return <E as="button" className={`catalog-button ${primary ? 'primary' : 'compact'}`} onClick={()=>{selection.add(product.id,product.databaseId);onAdded('Добавлено в подборку');}}>В подборку +</E>;}

export function LiveProductDetails({ id }) {
 const data = useLiveProducts();
 const params = useSearchParams();
 const [notice, setNotice] = useState('');
 const from = params.get('from');
 const catalogHref = productCatalogHref(from, 'api');
 const product = getApiCatalogReadProduct(id, data.items);
 const related = product ? catalogFamilyMembers(product, data.items) : [];
 const warnings = product ? catalogSourceWarnings(product, data.items) : [];
 return <div className="catalog-page product-page">
  <E as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href={catalogHref}>Каталог</Link><E as="span" aria-hidden="true">/</E><E>Карточка оборудования</E></E>
  <LiveStatus data={data}/>
  {data.status === 'ready' && (!product ? <div className="catalog-empty">
   <E as="h1">Товар недоступен</E><E as="p">Он скрыт, снят с публикации или ссылка устарела.</E><Link className="catalog-button primary" href={catalogHref}>Вернуться в актуальный каталог</Link>
  </div> : <>
   <ProductOverview product={product} records={data.items} price={catalogPrice(product)} notice={notice}
    visual={<ProductPhotoVisual key={product.id} product={product} records={data.items}/>}
    actions={<><AddButton product={product} onAdded={setNotice} primary/>{product.comparable && <Link className="catalog-button" href={productCatalogHref(from, 'api', product.id)}>К сравнению →</Link>}</>}
   />
   {isCatalogFamily(product) && <CatalogSourceEvidence product={product} records={data.items}/>}
   <div className="product-detail-sections">
    <E as="section" className="product-panel">
     <E as="h2">Технические характеристики</E>
     <ProductSpecificationRows product={product} records={data.items}/>
     {!product.technicalSpecs.length && !product.variantSpecs.length && product.attributes.length > 0 && <dl className="technical-specs">
      {product.attributes.map((row, index) => <div key={index}><E as="dt">{row.code}</E><E as="dd">{typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value ?? '—')}</E><E as="span">{row.unit || '—'}</E></div>)}
     </dl>}
     {!product.technicalSpecs.length && !product.variantSpecs.length && !product.attributes.length && <E as="p">Характеристики ещё не добавлены.</E>}
     {warnings.length > 0 && <details className="catalog-data-warning"><E as="summary">Примечания источника ({warnings.length})</E><ul>{warnings.map((warning, index) => <E as="li" key={index}>{warning.note}{warning.productId !== product.id && <> <Link href={liveHref(warning.productId)}>Запись: {warning.designation} →</Link></>}</E>)}</ul></details>}
     <CatalogConfigurations product={product}/>
    </E>
    {(related.length > 0 || (product.familyId && data.items.some(item => item.id === product.familyId))) && <E as="section" className="product-panel">
     {product.familyId && data.items.some(item => item.id === product.familyId) && <E as="p"><Link href={liveHref(product.familyId)}>Семейство: {displayFamilyName(product) || product.familyId} →</Link></E>}
     {related.length > 0 && <><E as="h2">Опубликованные исполнения серии</E><div className="variant-grid">{related.map(item => <Link key={item.id} href={liveHref(item.id)}><ProductIcon product={item} size={40}/><E as="span">{catalogMemberLabel(item)}</E></Link>)}</div></>}
    </E>}
    <E as="section" className="product-panel">
     <E as="h2">Описание и источник</E>
     {product.description && <E as="p">{displayDescription(product, data.items)}</E>}
     <E as="p">{product.sourceTitle || 'Данные владельца каталога'}</E>
     {product.sourceUrl && <LocalResourceAnchor href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Открыть источник ↗</LocalResourceAnchor>}
     <div className="catalog-source-pages">{product.sourcePages.map(page => {
      const href = sourcePageUrl(product, page);
      return href ? <Link key={page} href={href}>Страница {page}</Link> : null;
     })}</div>
    </E>
   </div>
   {!isCatalogFamily(product) && <CatalogSourceEvidence product={product} records={data.items}/>}
   <div className="catalog-bottom-nav"><Link href={catalogHref}>← Вернуться к каталогу</Link><Link href="/selection?source=api">Моя подборка →</Link></div>
  </>)}
 </div>;
}
export function LiveComparison(){
 const tx = useTranslate();
 const data=useLiveProducts(),params=useSearchParams(),router=useRouter();const [notice,setNotice]=useState('');
 const ids=parseComparison(params.get('ids'),data.items.filter(item=>item.comparable)),selected=ids.map(id=>data.items.find(item=>item.id===id));
 const rows=[...new Map(selected.flatMap(product=>product.technicalSpecs.map(spec=>[`${spec.label}|${spec.unit}`,spec]))).values()];
 const catalogHref=`/catalog?source=api&compare=${ids.join(',')}`;
 return <div className="catalog-page catalog-comparison">
  <E as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog?source=api">Каталог</Link><E as="span" aria-hidden="true">/</E><E as="span">Сравнение</E></E>
  <div className="catalog-heading compact-heading"><div><E as="p" className="catalog-kicker">АКТУАЛЬНЫЙ КАТАЛОГ</E><E as="h1">Сравнение оборудования</E></div>{selected.length>=2&&<Link className="catalog-button" href={catalogHref}>Изменить выбор →</Link>}</div>
  <LiveStatus data={data}/>
  {data.status==='ready'&&(selected.length<2
   ? <div className="catalog-empty"><E as="h2">Выберите минимум две позиции</E><E as="p">Сравнивайте до четырёх позиций по техническим параметрам.</E><Link className="catalog-button primary" href={catalogHref}>Выбрать в каталоге</Link></div>
   : <div className="comparison-table-wrap" role="region" aria-label="Сравнение параметров, прокрутка по горизонтали" tabIndex={0}>
    <table className="comparison-table">
     <thead><tr><E as="th" scope="col">Параметр</E>{selected.map(product=><E as="th" key={product.id} scope="col">
      <E as="button" type="button" className="remove-compare" aria-label={`${tx('Удалить')} ${tx(product.designation || product.sku || product.name)}`} onClick={()=>router.replace(`/catalog/compare?source=api&ids=${ids.filter(id=>id!==product.id).join(',')}`)}>×</E>
      <div className="comparison-product-icon"><ProductIcon product={product} size={48}/></div>
      <Link href={liveHref(product.id)}>{displayProductName(product)}</Link>{displayExecution(product)&&<E as="span" className="catalog-meta">{displayExecution(product)}</E>}
      <AddButton product={product} onAdded={setNotice}/>
     </E>)}</tr></thead>
     <tbody><tr><E as="th" scope="row">Цена</E>{selected.map(product=><E as="td" key={product.id}>{catalogPrice(product)}</E>)}</tr>
      {rows.map(row=><tr key={`${row.label}|${row.unit}`}><E as="th" scope="row" className="catalog-spec-text">{row.label}{row.unit?`, ${row.unit}`:''}</E>{selected.map(product=><E as="td" key={product.id} className="catalog-spec-text"><CatalogSpecValue product={product} row={row} value={comparisonSpecValue(product.technicalSpecs, row)}/></E>)}</tr>)}
     </tbody>
    </table>
   </div>)}
  <E as="p" role="status" className="catalog-status">{notice}</E>
 </div>;
}
export function LiveSelection(){
 const tx = useTranslate();
 const data=useLiveProducts(),selection=useApiSelection();const [notice,setNotice]=useState('');
 const available=selection.items.filter(item=>data.items.some(product=>product.id===item.id&&(!item.databaseId||product.databaseId===item.databaseId)));
 function download(){const blob=new Blob([selectionCsv(available,data.items,tx)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='alageum-live-selection.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Подборка скачана. Недоступные позиции не включены.');}
 return <div className="catalog-page catalog-selection">
  <E as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog?source=api">Каталог</Link><E as="span" aria-hidden="true">/</E><E as="span">Моя подборка</E></E>
  <div className="catalog-heading compact-heading"><div><E as="p" className="catalog-kicker">АКТУАЛЬНЫЙ КАТАЛОГ</E><E as="h1">Моя подборка</E></div><E as="p">Список доступен в этом браузере.</E></div>
  {selection.storageUnavailable&&<E as="p" className="catalog-notice" role="status">Хранилище браузера недоступно. Подборка сохранится только до закрытия страницы.</E>}
  <LiveStatus data={data}/>
  {data.status==='ready'&&(selection.items.length
   ? <div className="selection-layout">
    <div className="selection-items">{selection.items.map(item=>{
     const product=data.items.find(product=>product.id===item.id&&(!item.databaseId||product.databaseId===item.databaseId));
     return <article className="selection-item" key={item.id}>
      <div className="selection-product">{product?<><ProductIcon product={product} size={48}/><div><Link className="product-name" href={liveHref(product.id)}>{displayProductName(product)}</Link>{displayExecution(product)&&<E as="p" className="catalog-meta">{displayExecution(product)}</E>}<E as="p">{catalogPrice(product)}</E></div></>:<div><E as="strong">{item.id}</E><E as="p">Товар больше не опубликован. Он исключён из скачиваемой подборки.</E></div>}</div>
      <E as="label" className="quantity-label"><E as="span">Количество, шт.</E><E as="input" aria-label={`${tx('Количество')} ${tx(product?.sku||item.id)}`} type="number" min="1" max="999" value={item.quantity} onChange={event=>selection.setQuantity(item.id,event.target.value)}/></E>
      <E as="button" type="button" className="remove-item" aria-label={`Удалить ${product?.sku||item.id}`} onClick={()=>selection.remove(item.id)}>×</E>
     </article>;
    })}</div>
    <aside className="selection-summary">
     <E as="p" className="catalog-kicker">СОСТАВ ПОДБОРКИ</E>
     <dl><div><E as="dt">Позиций</E><E as="dd">{selection.items.length}</E></div><div><E as="dt">Единиц оборудования</E><E as="dd">{selection.count}</E></div></dl>
     <Link className="catalog-button primary" href="/inquiry?source=api">Запросить КП →</Link>
     <E as="button" type="button" className="catalog-button" disabled={!available.length} onClick={download}>Скачать CSV</E>
     <Link className="site-text-link" href="/catalog?source=api">Продолжить подбор →</Link>
     <E as="p">Скачивание не отправляет заявку и не оформляет заказ. CSV сохраняет исходные наименования каталога.</E>
    </aside>
   </div>
   : <div className="catalog-empty"><E as="h2">В подборке пока нет оборудования</E><E as="p">Добавьте товары из актуального каталога.</E><Link className="catalog-button primary" href="/catalog?source=api">Перейти в каталог →</Link></div>)}
  <E as="p" role="status" className="catalog-status">{notice}</E>
 </div>;
}
