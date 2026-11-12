import E from '@/components/locale/LocaleElement';
import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import { sourcePageUrl, getCatalogSource } from '@/lib/catalog/sources';
import Link from '@/components/locale/LocaleLink';
import { officialProducts } from '@/lib/catalog/data';
import ProductIcon from './ProductIcon';
import CatalogConfigurations from './CatalogConfigurations';
import ProductSpecificationRows from './ProductSpecificationRows';
import { catalogFamilyMembers, catalogMemberLabel, displayFamilyName, catalogSourceWarnings } from '@/lib/catalog/presentation';

export function SourcePageLink({ page, product }) {
 const href = sourcePageUrl(product, page);
 if (!href) return <E as="span" className="source-page-link">стр. {page}</E>;
 return <Link href={href} className="source-page-link">стр. {page}</Link>;
}
export function ImportedSpecifications({ product }) {
 if (product.sourceKind !== 'supplied-pdf') return null;
 const variants = catalogFamilyMembers(product, officialProducts);
 const warnings = catalogSourceWarnings(product, officialProducts);
 return <div className="imported-specifications">
  <div className="catalog-source-line"><E as="span">{product.sourceTitle}</E><E as="span">{product.sourcePages.map(page => <SourcePageLink product={product} page={page} key={page}/>)}</E></div>
  {product.familyId && <E as="p" className="family-back-link"><Link href={`/catalog/${product.familyId}`}>← Все исполнения серии {displayFamilyName(product)}</Link></E>}
  {!!warnings.length && <details className="catalog-data-warning"><E as="summary">Примечания и ограничения источника ({warnings.length})</E><ul>{warnings.map((warning,i)=><E as="li" key={i}>{warning.note}{warning.productId !== product.id && <> <Link href={`/catalog/${warning.productId}`}>Запись: {warning.designation} →</Link></>}</E>)}</ul></details>}
  <E as="h3">Параметры из печатного каталога</E>
  <E as="p" className="filter-help">Значения сохранены с единицами источника. Табличные варианты и диапазоны не означают подтверждённую комплектацию или готовый артикул заказа. Несогласованности исходного издания указаны в примечаниях.</E>
  <ProductSpecificationRows product={product} records={officialProducts}/>
  {variants.length>0 && <E as="section" className="catalog-variants"><E as="h3">Модели и обозначения в каталоге <E as="span">({variants.length})</E></E><E as="p" className="filter-help">Обозначения приведены из таблиц, подписей или составлены по напечатанному шаблону; особенности указаны в примечаниях. Наличие, актуальность и код заказа уточняются.</E><div className="variant-grid">{variants.map(variant=><Link key={variant.id} href={`/catalog/${variant.id}`}><ProductIcon product={variant} size={40}/><E as="strong">{variant.designation || variant.sku || variant.name}</E><E as="span">{catalogMemberLabel(variant)}</E><E as="span">Открыть характеристики →</E></Link>)}</div></E>}
  <CatalogConfigurations product={product}/>
 </div>;
}
export function ImportedDocuments({ product }) {
 return <div className="editorial-panel"><E as="h2">Страницы исходного каталога</E><E as="p">{product.sourceTitle}. Доступны изображения {getCatalogSource(product)?.page_count || 'всех'} физических страниц, включая исходные таблицы, схемы и чертежи.</E><div className="catalog-source-pages">{product.sourcePages.map(page=><SourcePageLink product={product} page={page} key={page}/>)}</div><LocalResourceAnchor className="catalog-button" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Открыть исходный PDF в Google Drive ↗</LocalResourceAnchor><E as="p" className="catalog-meta">Каталог не заменяет паспорт конкретного изделия. {getCatalogSource(product)?.id === 'substations' && 'Сертификаты на страницах 99–100 являются историческими репродукциями; их текущая действительность не подтверждена.'}</E>{product.additionalSources?.map(source=><E as="p" key={source.url}><LocalResourceAnchor href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</LocalResourceAnchor></E>)}<Link className="site-text-link" href="/documents">Все источники и документы →</Link></div>;
}
