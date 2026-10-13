import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ClientWorkspace from '@/components/ecosystem/ClientWorkspace';
export default async function ClientSection({ params }) {const { section } = await params;if (!['projects', 'orders', 'documents', 'support', 'profile'].includes(section)) notFound();return <LocaleElement as="div" className="eco-page"><Suspense fallback={<LocaleElement as="p">Загружаем кабинет…</LocaleElement>}><ClientWorkspace section={section} /></Suspense></LocaleElement>;}
