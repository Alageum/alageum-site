'use client';import LocaleElement from "@/components/locale/LocaleElement";
import Image from "@/components/locale/LocaleImage";
import Link from "@/components/locale/LocaleLink";
import { useSearchParams } from 'next/navigation';import { useRouter } from "@/components/locale/navigation";
import { catalogImport, transformerImport, productById } from '@/lib/catalog/data';
import { catalogSources, defaultCatalogSourceId, sourcePageUrl, sourcePageImage } from '@/lib/catalog/sources';
const pageTypes = { cover: 'Обложка', blank: 'Пустая страница', overview: 'Обзор', contents: 'Содержание', product: 'Продукция', continuation: 'Характеристики / схемы', certificate: 'Исторические сертификаты', notes: 'Заметки', contacts: 'Контакты' };
export default function CatalogSource() {
  const params = useSearchParams(),router = useRouter();
  const sourceId = params.get('source') || defaultCatalogSourceId;
  const source = catalogSources[sourceId];
  if (!source) return <LocaleElement as="div" className="catalog-page"><LocaleElement as="h1">Исходное издание не найдено</LocaleElement><Link href="/catalog/source">Открыть каталог источников</Link></LocaleElement>;
  const metadata = sourceId === defaultCatalogSourceId ? catalogImport : transformerImport;
  const page = Math.max(1, Math.min(source.page_count, Number.parseInt(params.get('page') || '1', 10) || 1));
  const entry = metadata.coverage?.find((item) => item.page === page);
  const families = (entry?.families || []).map(productById).filter(Boolean);
  const image = sourcePageImage(sourceId, page);
  function go(value) {router.push(sourcePageUrl(sourceId, Number(value)), { scroll: false });}
  return <LocaleElement as="div" className="catalog-page catalog-source-viewer"><LocaleElement as="nav" className="breadcrumbs" aria-label="Хлебные крошки"><Link href="/catalog">Каталог</Link><LocaleElement as="span">/</LocaleElement><LocaleElement as="span">Исходное издание</LocaleElement></LocaleElement>
  <LocaleElement as="div" className="catalog-heading compact-heading"><LocaleElement as="div"><LocaleElement as="p" className="catalog-kicker">{source.page_count} ФИЗИЧЕСКИХ СТРАНИЦ</LocaleElement><LocaleElement as="h1">{source.title}</LocaleElement></LocaleElement><LocaleElement as="p">{metadata.active === false ? 'Постраничный источник. Проверка и сверка каталожных записей продолжаются.' : `${metadata.familyCount} серий и семейств. Обозначения и конфигурации сохраняются отдельно от кодов заказа.`}</LocaleElement></LocaleElement>
  <LocaleElement as="label">Издание <LocaleElement as="select" aria-label="Исходное издание" value={sourceId} onChange={(event) => router.push(sourcePageUrl(event.target.value, 1), { scroll: false })}>{Object.values(catalogSources).map((item) => <LocaleElement as="option" key={item.id} value={item.id}>{item.title}</LocaleElement>)}</LocaleElement></LocaleElement>
  <LocaleElement as="div" className="source-viewer-toolbar"><LocaleElement as="button" className="catalog-button" disabled={page === 1} onClick={() => go(page - 1)}>← Назад</LocaleElement><LocaleElement as="label">Страница<LocaleElement as="select" aria-label="Страница исходного каталога" value={page} onChange={(event) => go(event.target.value)}>{Array.from({ length: source.page_count }, (_, i) => {const number = i + 1;const item = metadata.coverage?.find((row) => row.page === number);return <LocaleElement as="option" key={number} value={number}>{number}{item ? ` · ${pageTypes[item.type] || item.type}` : ''}</LocaleElement>;})}</LocaleElement></LocaleElement><LocaleElement as="button" className="catalog-button" disabled={page === source.page_count} onClick={() => go(page + 1)}>Далее →</LocaleElement>{sourceId === defaultCatalogSourceId && <LocaleElement as="a" href="/documents/substations-local-edition.pdf" download>Скачать локальное издание PDF · 72 МБ</LocaleElement>}</LocaleElement>
  {sourceId === 'transformers-2026' && <LocaleElement as="p" className="catalog-data-warning" data-source-document-notice="transformers-2026">Оригинальный PDF передаётся отдельно. Все 187 страниц доступны в этом просмотрщике.</LocaleElement>}
  {metadata.unresolvedLabels?.some((item) => item.page === page) && <LocaleElement as="p" className="catalog-data-warning">{metadata.unresolvedLabels.filter((item) => item.page === page).map((item) => item.reason).join(' ')}</LocaleElement>}
  {families.length > 0 && <LocaleElement as="div" className="source-page-products">На этой странице: {families.map((item) => <Link href={`/catalog/${item.id}`} key={item.id}>{item.designation || item.sku || item.name} →</Link>)}</LocaleElement>}
  {sourceId === defaultCatalogSourceId && page >= 99 && page <= 100 && <LocaleElement as="p" className="catalog-data-warning">Исторические репродукции сертификатов из издания 2024 года. Текущая действительность не подтверждена.</LocaleElement>}
  <LocaleElement as="a" href={image} target="_blank" rel="noopener noreferrer" className="source-page-image"><Image key={`${sourceId}-${page}`} src={image} width={1406} height={1988} alt={`${source.title}, физическая страница ${page}`} unoptimized priority /><LocaleElement as="span">Открыть страницу крупнее ↗</LocaleElement></LocaleElement><LocaleElement as="p" className="filter-help">Номер ссылки означает физическую страницу PDF. Напечатанная нумерация может отличаться. Изображения воспроизводят источник; противоречия согласовывайте с производителем.</LocaleElement>
 </LocaleElement>;
}
