import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import Selection from '@/components/catalog/Selection';
export const metadata = { title: 'Моя подборка' };
export default function SelectionPage() {return <Suspense fallback={<LocaleElement as="div" className="catalog-page">Загрузка подборки…</LocaleElement>}><Selection /></Suspense>;}
