'use client';
import { sourcePageUrl } from '@/lib/catalog/sources';
import E from '@/components/locale/LocaleElement';
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
 return data.status==='loading'?<p className="catalog-loading" role="status">Загрузка актуальных данных…</p>:data.status==='error'?<div className="catalog-empty" role="alert" aria-label="Ошибка каталога"><h2>Сервер каталога недоступен</h2><p>Актуальные товары и цены не удалось получить.</p><p>{data.error}</p><div className="inline-actions"><button className="catalog-button" onClick={data.retry}>Повторить</button>{process.env.NEXT_PUBLIC_CATALOG_SOURCE !== 'api' && <Link href="/catalog?source=static">Справочный статический каталог</Link>}</div></div>:null;
}
function LiveNotice(){return <p className="catalog-notice">Цены указаны в валюте каждой позиции. Наличие и условия поставки уточняются.</p>;}
function AddButton({product,onAdded,primary=false}) {const selection=useApiSelection();return <button className={`catalog-button ${primary ? 'primary' : 'compact'}`} onClick={()=>{selection.add(product.id,product.databaseId);onAdded('Добавлено в подборку');}}>В подборку +</button>;}

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
  <E as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href={catalogHref}>Каталог</Link><span aria-hidden="true">/</span><E>Карточка оборудования</E></E>
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
    <section className="product-panel">
     <E as="h2">Технические характеристики</E>
     <ProductSpecificationRows product={product} records={data.items}/>
     {!product.technicalSpecs.length && !product.variantSpecs.length && product.attributes.length > 0 && <dl className="technical-specs">
      {product.attributes.map((row, index) => <div key={index}><dt>{row.code}</dt><dd>{typeof row.value === 'object' ? JSON.stringify(row.value) : String(row.value ?? '—')}</dd><span>{row.unit || '—'}</span></div>)}
     </dl>}
     {!product.technicalSpecs.length && !product.variantSpecs.length && !product.attributes.length && <E as="p">Характеристики ещё не добавлены.</E>}
     {warnings.length > 0 && <details className="catalog-data-warning"><E as="summary">Примечания источника ({warnings.length})</E><ul>{warnings.map((warning, index) => <li key={index}>{warning.note}{warning.productId !== product.id && <> <Link href={liveHref(warning.productId)}>Запись: {warning.designation} →</Link></>}</li>)}</ul></details>}
     <CatalogConfigurations product={product}/>
    </section>
    {(related.length > 0 || (product.familyId && data.items.some(item => item.id === product.familyId))) && <section className="product-panel">
     {product.familyId && data.items.some(item => item.id === product.familyId) && <p><Link href={liveHref(product.familyId)}>Семейство: {displayFamilyName(product) || product.familyId} →</Link></p>}
     {related.length > 0 && <><E as="h2">Опубликованные исполнения серии</E><div className="variant-grid">{related.map(item => <Link key={item.id} href={liveHref(item.id)}><ProductIcon product={item} size={40}/><span>{catalogMemberLabel(item)}</span></Link>)}</div></>}
    </section>}
    <section className="product-panel">
     <E as="h2">Описание и источник</E>
     {product.description && <E as="p">{displayDescription(product, data.items)}</E>}
     <E as="p">{product.sourceTitle || 'Данные владельца каталога'}</E>
     {product.sourceUrl && <LocalResourceAnchor href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Открыть источник ↗</LocalResourceAnchor>}
     <div className="catalog-source-pages">{product.sourcePages.map(page => {
      const href = sourcePageUrl(product, page);
      return href ? <Link key={page} href={href}>Страница {page}</Link> : null;
     })}</div>
    </section>
   </div>
   {!isCatalogFamily(product) && <CatalogSourceEvidence product={product} records={data.items}/>}
   <div className="catalog-bottom-nav"><Link href={catalogHref}>← Вернуться к каталогу</Link><Link href="/selection?source=api">Моя подборка →</Link></div>
  </>)}
 </div>;
}
export function LiveComparison(){
 const data=useLiveProducts(),params=useSearchParams(),router=useRouter();const [notice,setNotice]=useState('');
 const ids=parseComparison(params.get('ids'),data.items.filter(item=>item.comparable)),selected=ids.map(id=>data.items.find(item=>item.id===id));
 const rows=[...new Map(selected.flatMap(product=>product.technicalSpecs.map(spec=>[`${spec.label}|${spec.unit}`,spec]))).values()];
 const catalogHref=`/catalog?source=api&compare=${ids.join(',')}`;
 return <div className="catalog-page catalog-comparison">
  <nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog?source=api">Каталог</Link><span aria-hidden="true">/</span><span>Сравнение</span></nav>
  <div className="catalog-heading compact-heading"><div><p className="catalog-kicker">АКТУАЛЬНЫЙ КАТАЛОГ</p><h1>Сравнение оборудования</h1></div>{selected.length>=2&&<Link className="catalog-button" href={catalogHref}>Изменить выбор →</Link>}</div>
  <LiveStatus data={data}/>
  {data.status==='ready'&&(selected.length<2
   ? <div className="catalog-empty"><h2>Выберите минимум две позиции</h2><p>Сравнивайте до четырёх позиций по техническим параметрам.</p><Link className="catalog-button primary" href={catalogHref}>Выбрать в каталоге</Link></div>
   : <div className="comparison-table-wrap" role="region" aria-label="Сравнение параметров, прокрутка по горизонтали" tabIndex={0}>
    <table className="comparison-table">
     <thead><tr><th scope="col">Параметр</th>{selected.map(product=><th key={product.id} scope="col">
      <button type="button" className="remove-compare" aria-label={`Убрать ${product.designation || product.sku || product.name}`} onClick={()=>router.replace(`/catalog/compare?source=api&ids=${ids.filter(id=>id!==product.id).join(',')}`)}>×</button>
      <div className="comparison-product-icon"><ProductIcon product={product} size={48}/></div>
      <Link href={liveHref(product.id)}>{displayProductName(product)}</Link>{displayExecution(product)&&<span className="catalog-meta">{displayExecution(product)}</span>}
      <AddButton product={product} onAdded={setNotice}/>
     </th>)}</tr></thead>
     <tbody><tr><th scope="row">Цена</th>{selected.map(product=><td key={product.id}>{catalogPrice(product)}</td>)}</tr>
      {rows.map(row=><tr key={`${row.label}|${row.unit}`}><th scope="row" className="catalog-spec-text">{row.label}{row.unit?`, ${row.unit}`:''}</th>{selected.map(product=><td key={product.id} className="catalog-spec-text"><CatalogSpecValue product={product} row={row} value={comparisonSpecValue(product.technicalSpecs, row)}/></td>)}</tr>)}
     </tbody>
    </table>
   </div>)}
  <p role="status" className="catalog-status">{notice}</p>
 </div>;
}
export function LiveSelection(){
 const data=useLiveProducts(),selection=useApiSelection();const [notice,setNotice]=useState('');
 const available=selection.items.filter(item=>data.items.some(product=>product.id===item.id&&(!item.databaseId||product.databaseId===item.databaseId)));
 function download(){const blob=new Blob([selectionCsv(available,data.items)],{type:'text/csv;charset=utf-8;'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='alageum-live-selection.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);setNotice('Подборка скачана. Недоступные позиции не включены.');}
 return <div className="catalog-page catalog-selection">
  <nav className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog?source=api">Каталог</Link><span aria-hidden="true">/</span><span>Моя подборка</span></nav>
  <div className="catalog-heading compact-heading"><div><p className="catalog-kicker">АКТУАЛЬНЫЙ КАТАЛОГ</p><h1>Моя подборка</h1></div><p>Список доступен в этом браузере.</p></div>
  {selection.storageUnavailable&&<p className="catalog-notice" role="status">Хранилище браузера недоступно. Подборка сохранится только до закрытия страницы.</p>}
  <LiveStatus data={data}/>
  {data.status==='ready'&&(selection.items.length
   ? <div className="selection-layout">
    <div className="selection-items">{selection.items.map(item=>{
     const product=data.items.find(product=>product.id===item.id&&(!item.databaseId||product.databaseId===item.databaseId));
     return <article className="selection-item" key={item.id}>
      <div className="selection-product">{product?<><ProductIcon product={product} size={48}/><div><Link className="product-name" href={liveHref(product.id)}>{displayProductName(product)}</Link>{displayExecution(product)&&<p className="catalog-meta">{displayExecution(product)}</p>}<p>{catalogPrice(product)}</p></div></>:<div><strong>{item.id}</strong><p>Товар больше не опубликован. Он исключён из скачиваемой подборки.</p></div>}</div>
      <label className="quantity-label"><span>Количество, шт.</span><input aria-label={`Количество ${product?.sku||item.id}`} type="number" min="1" max="999" value={item.quantity} onChange={event=>selection.setQuantity(item.id,event.target.value)}/></label>
      <button type="button" className="remove-item" aria-label={`Удалить ${product?.sku||item.id}`} onClick={()=>selection.remove(item.id)}>×</button>
     </article>;
    })}</div>
    <aside className="selection-summary">
     <p className="catalog-kicker">СОСТАВ ПОДБОРКИ</p>
     <dl><div><dt>Позиций</dt><dd>{selection.items.length}</dd></div><div><dt>Единиц оборудования</dt><dd>{selection.count}</dd></div></dl>
     <Link className="catalog-button primary" href="/inquiry?source=api">Запросить КП →</Link>
     <button type="button" className="catalog-button" disabled={!available.length} onClick={download}>Скачать CSV</button>
     <Link className="site-text-link" href="/catalog?source=api">Продолжить подбор →</Link>
     <p>Скачивание не отправляет заявку и не оформляет заказ. CSV сохраняет исходные наименования каталога.</p>
    </aside>
   </div>
   : <div className="catalog-empty"><h2>В подборке пока нет оборудования</h2><p>Добавьте товары из актуального каталога.</p><Link className="catalog-button primary" href="/catalog?source=api">Перейти в каталог →</Link></div>)}
  <p role="status" className="catalog-status">{notice}</p>
 </div>;
}
