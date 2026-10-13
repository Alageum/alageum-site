import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import Catalog from '@/components/catalog/Catalog';
export const metadata = { title: 'Технический каталог' };
export default function CatalogPage() {
  return <Suspense fallback={<LocaleElement as="div" className="catalog-page"><LocaleElement as="p" role="status">Загрузка каталога…</LocaleElement></LocaleElement>}><Catalog /></Suspense>;
}
