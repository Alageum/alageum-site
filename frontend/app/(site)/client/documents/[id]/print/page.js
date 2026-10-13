import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import ClientDocument from '@/components/ecosystem/ClientDocument';
export default async function Document({ params }) {const { id } = await params;return <Suspense fallback={<LocaleElement as="p">Загружаем документ…</LocaleElement>}><ClientDocument id={id} /></Suspense>;}
