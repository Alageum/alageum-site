import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import ClientWorkspace from '@/components/ecosystem/ClientWorkspace';
export const metadata = { title: 'Локальный кабинет клиента' };
export default function Client() {return <LocaleElement as="div" className="eco-page"><Suspense fallback={<LocaleElement as="p">Загружаем кабинет…</LocaleElement>}><ClientWorkspace /></Suspense></LocaleElement>;}
