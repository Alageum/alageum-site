import LocaleElement from "@/components/locale/LocaleElement";import Link from "@/components/locale/LocaleLink";
import { getCatalogSource, sourcePageUrl } from '@/lib/catalog/sources';
import { catalogConfigurationLabel, displaySpecLabel } from '@/lib/catalog/presentation';

function validPage(product, page) {
  const source = getCatalogSource(product);
  return Number.isInteger(page) && page > 0 && (!source || page <= source.page_count);
}
function PageLink({ product, page }) {
  if (!validPage(product, page)) return null;
  const href = sourcePageUrl(product, page);
  return href ? <Link className="source-page-link" href={href}>стр. {page}</Link> : <LocaleElement as="span">стр. {page}</LocaleElement>;
}

export default function CatalogConfigurations({ product, configurations = product.configurations || [] }) {
  if (!configurations.length) return null;
  return <LocaleElement as="section" className="catalog-variants catalog-table-configurations"><LocaleElement as="h3">Табличные строки и варианты <LocaleElement as="span">({configurations.length})</LocaleElement></LocaleElement>
    <LocaleElement as="p" className="filter-help">Каждая строка сохраняет напечатанные вместе параметры, размеры или индексы. Это не отдельные модели и не готовые артикулы заказа; новые сочетания параметров не созданы.</LocaleElement>
    {configurations.map((configuration, index) => {
      const label = catalogConfigurationLabel(configuration, index);
      const designation = configuration.designation || label;
      const qualifier = label === designation ? '' : label.startsWith(`${designation} · `) ? label.slice(designation.length + 3) : label;
      return <LocaleElement as="details" className="catalog-configuration" key={configuration.id || index} data-configuration-id={configuration.id || undefined}>
        <LocaleElement as="summary" className="catalog-spec-text"><LocaleElement as="span" className="configuration-designation">{designation}</LocaleElement>{qualifier && <LocaleElement as="span" className="configuration-qualifier">{qualifier}</LocaleElement>}<LocaleElement as="span" className="configuration-meta">{configuration.kind === 'code-option' ? 'Индекс обозначения' : 'Строка таблицы'}{validPage(product, configuration.page) ? ` · стр. ${configuration.page}` : ''}</LocaleElement></LocaleElement>
        <LocaleElement as="dl">{(configuration.specifications || []).map((spec, i) => <LocaleElement as="div" key={i}><LocaleElement as="dt" className="catalog-spec-text">{displaySpecLabel(spec.label)}</LocaleElement><LocaleElement as="dd" className="catalog-spec-text">{spec.value ?? '—'}</LocaleElement><LocaleElement as="span" className="configuration-source catalog-spec-text"><LocaleElement as="span">{spec.unit || '—'}</LocaleElement><PageLink product={product} page={spec.page} /></LocaleElement></LocaleElement>)}</LocaleElement>
        {!!configuration.notes?.length && <LocaleElement as="ul">{configuration.notes.map((note, i) => <LocaleElement as="li" key={i}>{note}</LocaleElement>)}</LocaleElement>}
        <PageLink product={product} page={configuration.page} />
      </LocaleElement>;
    })}
  </LocaleElement>;
}
