'use client';

import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { isApiCatalog } from '@/lib/catalog/apiData';
import { productById, officialProducts, specRows, valueOrDash, specUnit } from '@/lib/catalog/data';
import { equipmentTypeFor, getCatalogSpecSummary } from '@/lib/catalog/grouping';
import { equipmentModelName } from '@/lib/catalog/models/types';
import { displayDescription, displayProductName, isCatalogFamily, catalogSourceWarnings } from '@/lib/catalog/presentation';
import CatalogNotice from './CatalogNotice';
import CatalogSourceEvidence from './CatalogSourceEvidence';
import { ImportedSpecifications, ImportedDocuments } from './ImportedProductData';
import { LiveProductDetails } from './LiveCatalog';
import { ProductOverview, productCatalogHref } from './ProductOverview';
import ProductIcon from './ProductIcon';
import ProductPhotoVisual from './ProductPhotoVisual';
import ProductSpecificationRows from './ProductSpecificationRows';
import RelatedProducts from './RelatedProducts';
import { useSelection } from './SelectionProvider';

const tabs = [{ id: 'specs', name: 'Характеристики' }, { id: 'overview', name: 'Описание' }, { id: 'documents', name: 'Документы' }];

function StaticProductDetails({ id }) {
  const params = useSearchParams();
  const [tab, setTab] = useState('specs');
  const [notice, setNotice] = useState('');
  const selection = useSelection();
  const product = productById(id);
  const from = params.get('from');
  const source = product?.source === 'demo' ? 'demo' : null;
  const catalogHref = productCatalogHref(from, source);
  if (!product) return <div className="catalog-page"><div className="catalog-empty">
    <E as="p" className="catalog-kicker">КАТАЛОГ</E><E as="h1">Позиция не найдена</E>
    <E as="p">Возможно, ссылка устарела. Выберите позицию из текущего каталога.</E>
    <Link className="catalog-button primary" href={catalogHref}>Вернуться в каталог</Link>
  </div></div>;
  const official = product.source === 'official';
  const supplied = product.sourceKind === 'supplied-pdf';
  const family = isCatalogFamily(product);
  const warnings = catalogSourceWarnings(product, officialProducts);
  const name = displayProductName(product);
  const designation = product.designation || product.sku || name;
  const visual = official
    ? <ProductPhotoVisual key={product.id} product={product} records={officialProducts}/>
    : <div className="product-visual">
      {product.image ? <Image src={product.image} alt={product.imageCaption || 'Иллюстрация из дизайн-системы'} width={520} height={440} priority/> : <E as="p" className="product-no-image">Изображение не предоставлено</E>}
      {product.image && <E as="p" className="catalog-meta">{product.imageCaption || 'Иллюстрация · не изображение конкретной модели'}</E>}
    </div>;

  function tabKey(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    setTab(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  }

  return <div className="catalog-page product-page">
    <E as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/">Главная</Link><span aria-hidden="true">/</span><Link href={catalogHref}>Каталог</Link><span aria-hidden="true">/</span><E>Карточка оборудования</E></E>
    <CatalogNotice compact source={product.source}/>
    <ProductOverview product={product} records={officialProducts} visual={visual} price={official ? 'Цена уточняется' : 'Демо · без цены'} hasWarnings={warnings.length > 0}
      classification={official && <p className="model-type-label"><ProductIcon product={product} size={28}/><Link href={productCatalogHref(`category=${product.category}&equipmentType=${equipmentTypeFor(product)}`, source)}>{equipmentModelName(equipmentTypeFor(product))}</Link></p>}
      actions={<><E as="button" className="catalog-button primary" onClick={() => { selection.add(product.id); setNotice(`${designation} добавлен в подборку`); }} aria-label={`В подборку ${designation}`}>Добавить в подборку <span aria-hidden="true">+</span></E><Link className="catalog-button" href={productCatalogHref(from, source, product.id)}>К сравнению <span aria-hidden="true">↗</span></Link></>}
      notice={notice && <>{notice} <Link href="/selection">Открыть подборку →</Link></>}
    />
    {family && <CatalogSourceEvidence product={product} records={officialProducts}/>}
    <E as="div" className="product-tabs" role="tablist" aria-label="Информация о позиции">
      {tabs.map((item, index) => <E as="button" type="button" key={item.id} id={`tab-${item.id}`} role="tab" aria-selected={tab === item.id} aria-controls={`panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => setTab(item.id)} onKeyDown={event => tabKey(event, index)}>
        {item.name}{item.id === 'documents' && <span>{product.sourceUrl ? 1 : 0}</span>}
      </E>)}
    </E>
    <section className="product-panel" id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
      {tab === 'specs' && <>
        <div className="section-title">
          <E as="h2">Технические характеристики</E>
          {family && <E as="p">Сводка отдельных записей семейства. Значения не образуют готовую комплектацию.</E>}
        </div>
        {!supplied && product.variantSpecs?.length > 0 && <ProductSpecificationRows product={product} records={officialProducts}/>}
        {!supplied && !product.variantSpecs?.length && <dl className="technical-specs">
          {(official ? [...getCatalogSpecSummary(product, officialProducts), { key: 'manufacturer', label: 'Производители серии', value: valueOrDash(product.manufacturer), unit: '' }] : specRows).map(row => <div key={row.key}>
            <E as="dt" className="catalog-spec-text">{row.label}</E>
            <E as="dd" className="catalog-spec-text">{row.value ?? valueOrDash(product[row.key])}</E>
            <E className="catalog-spec-text">{row.value ? row.unit : product[row.key] == null ? '—' : specUnit(product, row) || '—'}</E>
          </div>)}
        </dl>}
        {official && !supplied && <E as="p" className="filter-help">Напряжения через / или диапазон обозначают доступные исполнения серии. Это не подтверждение переключаемости. Производители указаны для серии; завод конкретной поставки уточняется.</E>}
        <ImportedSpecifications product={product}/>
      </>}
      {tab === 'overview' && <div className="editorial-panel">
        <E as="h2">Описание позиции</E><E as="p">{displayDescription(product, officialProducts) || 'Описание не предоставлено источником данных.'}</E>
        {source === 'demo' && <E as="p">Демонстрационная запись предназначена для проверки интерфейса каталога.</E>}
      </div>}
      {tab === 'documents' && (supplied ? <ImportedDocuments product={product}/> : product.sourceUrl ? <div className="editorial-panel">
        <E as="h2">Официальный источник характеристик</E><E as="p">Технические таблицы серии размещены на сайте производителя. Это HTML-страница, а не паспорт конкретного изделия.</E>
        <LocalResourceAnchor className="catalog-button" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Характеристики на официальном сайте ↗</LocalResourceAnchor>
        <E as="p" className="catalog-meta">Проверено 30.09.2026. Актуальные паспорта, чертежи и сертификаты запрашиваются для согласованного исполнения.</E>
        <Link className="site-text-link" href="/documents">Общие каталоги и референсы →</Link>
      </div> : <div className="document-empty"><span className="empty-icon" aria-hidden="true">↧</span><E as="h2">Документы ещё не добавлены</E><E as="p">Паспорта, чертежи и сертификаты появятся после получения утверждённых файлов и правил доступа.</E></div>)}
    </section>
    {!family && <CatalogSourceEvidence product={product} records={officialProducts}/>}
    {official && <RelatedProducts product={product}/>}
    <div className="catalog-bottom-nav"><Link href={catalogHref}>← Вернуться к каталогу</Link><Link href="/selection">Моя подборка →</Link></div>
  </div>;
}

export default function ProductDetails({ id }) {
  const params = useSearchParams();
  return isApiCatalog(params) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ? <LiveProductDetails id={id}/> : <StaticProductDetails id={id}/>;
}
