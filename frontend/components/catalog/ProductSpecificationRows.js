import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { displaySpecLabel } from '@/lib/catalog/presentation';
import { sourcePageUrl } from '@/lib/catalog/sources';
import CatalogSpecValue from './CatalogSpecValue';

function SpecificationTable({ product, rows }) {
  return <dl className="technical-specs imported-specs">{rows.map((row, index) => {
    const href = sourcePageUrl(product, row.page);
    const modules = row.label === 'Блок-модули' ? String(row.value ?? '').split(';').map(value => value.trim()).filter(Boolean) : [];
    return <div key={`${row.label}-${index}`}>
      <E as="dt" className="catalog-spec-text">{displaySpecLabel(row.label)}</E>
      <dd className="catalog-spec-text">{modules.length > 1 ? <ol className="product-module-list">{modules.map((module, position) => <E as="li" key={position}>{module}</E>)}</ol> : <CatalogSpecValue product={product} row={row}/>}</dd>
      <span className="catalog-spec-text">{row.unit || '—'}{href && <Link className="source-page-link" href={href}>стр. {row.page}</Link>}</span>
    </div>;
  })}</dl>;
}

export default function ProductSpecificationRows({ product, records }) {
  const exact = product.variantSpecs || [];
  const general = product.technicalSpecs || [];
  if (!exact.length && !general.length) return null;
  if (!exact.length) return <SpecificationTable product={product} rows={general}/>;

  // The API can include the exact printed rows again in the broader series table.
  const key = row => JSON.stringify([row.label, row.value, row.unit || '', row.page || null]);
  const exactKeys = new Set(exact.map(key));
  const remaining = general.filter(row => !exactKeys.has(key(row)));
  const family = records.find(row => row.id === product.familyId && row.source === product.source
    && row.sourceId === product.sourceId && row.sourceFileId === product.sourceFileId && row.sourceSha256 === product.sourceSha256);
  const familyKeys = new Set((family?.technicalSpecs || []).map(key));
  const familyRows = remaining.filter(row => familyKeys.has(key(row)));
  const otherRows = remaining.filter(row => !familyKeys.has(key(row)));
  return <>
    <E as="h3">Параметры этой записи</E>
    <SpecificationTable product={product} rows={exact}/>
    {familyRows.length > 0 && <section className="product-series-specifications">
      <E as="h3">Общие данные серии из источника</E>
      <SpecificationTable product={product} rows={familyRows}/>
    </section>}
    {otherRows.length > 0 && <section className="product-series-specifications">
      <E as="h3">Дополнительные данные источника</E>
      <SpecificationTable product={product} rows={otherRows}/>
    </section>}
  </>;
}
