import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import ClientWorkspace from '@/components/ecosystem/ClientWorkspace';
export default async function Project({ params }) {const { id } = await params;return <LocaleElement as="div" className="eco-page"><Suspense fallback={<LocaleElement as="p">Загружаем проект…</LocaleElement>}><ClientWorkspace section="projects" id={id} /></Suspense></LocaleElement>;}
