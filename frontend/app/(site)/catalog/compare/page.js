import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import Comparison from '@/components/catalog/Comparison';
export const metadata = { title: 'Сравнение оборудования' };
export default function ComparePage() {return <Suspense fallback={<LocaleElement as="div" className="catalog-page" role="status">Загрузка сравнения…</LocaleElement>}><Comparison /></Suspense>;}
