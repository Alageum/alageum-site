import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import ProductDetails from '@/components/catalog/ProductDetails';
import { products, productById } from '@/lib/catalog/data';
import { catalogReadAliases } from '@/lib/catalog/identityCompletion';
export function generateStaticParams() {return [...products.map((item) => ({ slug: item.id })), ...Object.keys(catalogReadAliases).map((slug) => ({ slug }))];}
export async function generateMetadata({ params }) {const item = productById((await params).slug);return { title: item?.name || 'Характеристики оборудования', description: item?.description || 'Параметры и источник данных оборудования.' };}
export default async function ProductPage({ params }) {
  const { slug } = await params;
  return <Suspense fallback={<LocaleElement as="div" className="catalog-page" role="status">Загрузка карточки…</LocaleElement>}><ProductDetails id={slug} /></Suspense>;
}
