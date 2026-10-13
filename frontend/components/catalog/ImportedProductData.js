import LocalResourceAnchor from '@/components/locale/LocalResourceAnchor';
import { sourcePageUrl, getCatalogSource } from '@/lib/catalog/sources';
import Link from '@/components/locale/LocaleLink';
import { officialProducts } from '@/lib/catalog/data';
import ProductIcon from './ProductIcon';
import CatalogConfigurations from './CatalogConfigurations';
import CatalogSpecValue from './CatalogSpecValue';
import { catalogFamilyMembers, catalogMemberLabel, displayFamilyName, displaySpecLabel, catalogSourceWarnings } from '@/lib/catalog/presentation';

export function SourcePageLink({ page, product }) {
 const href = sourcePageUrl(product, page);
 if (!href) return <span className="source-page-link">стр. {page}</span>;
 return <Link href={href} className="source-page-link">стр. {page}</Link>;
}
export function ImportedSpecifications({ product }) {
 if (product.sourceKind !== 'supplied-pdf') return null;
 const variants = catalogFamilyMembers(product, officialProducts);
 const warnings = catalogSourceWarnings(product, officialProducts);
 return <div className="imported-specifications">
  <div className="catalog-source-line"><span>{product.sourceTitle}</span><span>{product.sourcePages.map(page => <SourcePageLink product={product} page={page} key={page}/>)}</span></div>
  {product.familyId && <p className="family-back-link"><Link href={`/catalog/${product.familyId}`}>← Все исполнения серии {displayFamilyName(product)}</Link></p>}
  {!!warnings.length && <details className="catalog-data-warning"><summary>Примечания и ограничения источника ({warnings.length})</summary><ul>{warnings.map((warning,i)=><li key={i}>{warning.note}{warning.productId !== product.id && <> <Link href={`/catalog/${warning.productId}`}>Запись: {warning.designation} →</Link></>}</li>)}</ul></details>}
  <h3>Параметры из печатного каталога</h3>
  <p className="filter-help">Значения сохранены с единицами источника. Табличные варианты и диапазоны не означают подтверждённую комплектацию или готовый артикул заказа. Несогласованности исходного издания указаны в примечаниях.</p>
  <dl className="technical-specs imported-specs">{product.technicalSpecs.map((spec,i)=><div key={`${displaySpecLabel(spec.label)}-${i}`}><dt className="catalog-spec-text">{displaySpecLabel(spec.label)}</dt><dd className="catalog-spec-text"><CatalogSpecValue product={product} row={spec}/></dd><span className="catalog-spec-text">{spec.unit || '—'}<SourcePageLink product={product} page={spec.page}/></span></div>)}</dl>
  {variants.length>0 && <section className="catalog-variants"><h3>Модели и обозначения в каталоге <span>({variants.length})</span></h3><p className="filter-help">Обозначения приведены из таблиц, подписей или составлены по напечатанному шаблону; особенности указаны в примечаниях. Наличие, актуальность и код заказа уточняются.</p><div className="variant-grid">{variants.map(variant=><Link key={variant.id} href={`/catalog/${variant.id}`}><ProductIcon product={variant} size={40}/><strong>{variant.designation || variant.sku || variant.name}</strong><span>{catalogMemberLabel(variant)}</span><span>Открыть характеристики →</span></Link>)}</div></section>}
  <CatalogConfigurations product={product}/>
 </div>;
}
export function ImportedDocuments({ product }) {
 return <div className="editorial-panel"><h2>Страницы исходного каталога</h2><p>{product.sourceTitle}. Доступны изображения {getCatalogSource(product)?.page_count || 'всех'} физических страниц, включая исходные таблицы, схемы и чертежи.</p><div className="catalog-source-pages">{product.sourcePages.map(page=><SourcePageLink product={product} page={page} key={page}/>)}</div><LocalResourceAnchor className="catalog-button" href={product.sourceUrl} target="_blank" rel="noopener noreferrer">Открыть исходный PDF в Google Drive ↗</LocalResourceAnchor><p className="catalog-meta">Каталог не заменяет паспорт конкретного изделия. {getCatalogSource(product)?.id === 'substations' && 'Сертификаты на страницах 99–100 являются историческими репродукциями; их текущая действительность не подтверждена.'}</p>{product.additionalSources?.map(source=><p key={source.url}><LocalResourceAnchor href={source.url} target="_blank" rel="noopener noreferrer">{source.label} ↗</LocalResourceAnchor></p>)}<Link className="site-text-link" href="/documents">Все источники и документы →</Link></div>;
}
