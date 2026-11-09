import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { categoryName } from '@/lib/catalog/data';
import { compactCatalogSpecValue, getCatalogSpecSummary } from '@/lib/catalog/grouping';
import { displayDescription, displayExecution, displayProductName, displaySpecLabel, isCatalogFamily } from '@/lib/catalog/presentation';
import { sourcePageUrl } from '@/lib/catalog/sources';
import CatalogSpecValue from './CatalogSpecValue';
import './product-overview.css';

export function productCatalogHref(from, source, comparisonId) {
  const params = new URLSearchParams(from?.length <= 4000 ? from : '');
  params.delete('from');
  if (source) params.set('source', source);
  else params.delete('source');
  if (comparisonId) params.set('compare', comparisonId);
  return params.size ? `/catalog?${params}` : '/catalog';
}

const typeLabels = {
  family: 'Серия оборудования',
  variant: 'Каталожное исполнение',
  configuration: 'Табличные конфигурации',
  drawing: 'Запись по чертежу',
  product: 'Оборудование',
  brief: 'Справочная запись',
  demo: 'Синтетический пример',
};

function presentationType(product) {
  if (product.source === 'demo') return 'demo';
  if (product.sourceRecordType === 'drawing-only-model') return 'drawing';
  if (product.recordKind === 'variant') return 'variant';
  if (product.sourceRecordType === 'configuration-family' || (isCatalogFamily(product) && product.configurations?.length && !product.variantIds?.length)) return 'configuration';
  if (isCatalogFamily(product)) return 'family';
  return product.technicalSpecs?.length || product.attributes?.length ? 'product' : 'brief';
}

export function ProductOverview({ product, records, visual, classification, actions, price, notice, hasWarnings }) {
  const kind = presentationType(product);
  const name = displayProductName(product);
  const designation = product.designation || product.sku;
  const execution = displayExecution(product);
  const titleMatches = value => value?.normalize('NFKC').trim().toLocaleLowerCase('ru') === name.normalize('NFKC').trim().toLocaleLowerCase('ru');
  const variantRows = (product.variantSpecs || []).filter(row => row.value && row.value !== '—');
  const assemblyFacts = kind === 'variant' && variantRows.some(row => /^Габариты/.test(row.label))
    && variantRows.some(row => row.label === 'Количество трансформаторов');
  const exactRows = kind === 'drawing' || assemblyFacts ? variantRows : [];
  const summaries = exactRows.length ? exactRows.slice(0, 4) : getCatalogSpecSummary(product, records).filter(row => row.value !== '—').slice(0, 4);
  const sourcePage = exactRows.length && exactRows[0].page && summaries.every(row => row.page === exactRows[0].page) ? exactRows[0].page : null;
  const sourceHref = sourcePageUrl(product, sourcePage);
  const description = !product.description && isCatalogFamily(product) ? '' : displayDescription(product, records);
  const generatedPrefix = `${name}${execution ? ` · ${execution}` : ''}. `;
  const intro = (description.startsWith(generatedPrefix) ? description.slice(generatedPrefix.length) : description).split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z])/u)[0];
  return <div className="product-overview product-overview-refined" data-product-presentation={kind}>
    <header className="product-summary">
      <E as="p" className="catalog-kicker">{typeLabels[kind]}</E>
      <E as="h1">{name}</E>
      {classification}
      {designation && !titleMatches(designation) && <E as="p" className="product-code">{designation}</E>}
      {execution && execution !== designation && execution !== typeLabels[kind] && !titleMatches(execution) && <E as="p" className="product-execution">Исполнение строки: {execution}</E>}
      {intro && <E as="p" className="product-summary-text">{intro}</E>}
      {!!summaries.length && <E as="dl" className={`product-key-facts ${product.source === 'api' ? 'member-evidence-specs' : 'summary-specs'}`} aria-label="Ключевые параметры">
        {summaries.map((row, index) => <div key={row.key || `${row.label}-${index}`}>
          <E as="dt">{displaySpecLabel(row.label)}</E>
          <E as="dd">{exactRows.length ? <><CatalogSpecValue product={product} row={row}/>{row.unit && ` ${row.unit}`}</> : compactCatalogSpecValue(row)}</E>
          {exactRows.length > 0 && !sourcePage && sourcePageUrl(product, row.page) && <Link className="product-source-ref" href={sourcePageUrl(product, row.page)}>стр. {row.page}</Link>}
        </div>)}
      </E>}
      {sourceHref && <Link className="product-source-ref" href={sourceHref}><E>Источник параметров</E>{' · '}<E>стр.</E>{' '}{sourcePage}</Link>}
      {hasWarnings && <E as="p" className="catalog-data-warning">В исходной записи есть ограничения или несогласованности. Проверьте примечания источника перед выбором параметров.</E>}
      {kind === 'drawing' && <E as="p" className="filter-help">Источник показывает чертёж. Комплектацию и код заказа уточняет производитель.</E>}
      {kind === 'brief' && <E as="p" className="filter-help">Полный набор параметров уточняется по техническому заданию.</E>}
      <div className="product-action-strip">
        {price && <E as="h2" className="product-price">{price}</E>}
        <div className="product-actions">{actions}</div>
      </div>
      <E as="p" role="status" className="catalog-status">{notice}</E>
    </header>
    <div className="product-visual-pane">
      <div className="product-visual-label"><E as="strong">{kind === 'drawing' ? 'Чертёж и источники' : kind === 'family' || kind === 'configuration' ? 'Материалы серии' : 'Конструкция и материалы'}</E><E>{categoryName(product.category)}</E></div>
      {visual}
    </div>
  </div>;
}
