import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import CareerApplication from '@/components/ecosystem/CareerApplication';
import { EcoHero, EcoSection } from '@/components/ecosystem/Parts';
export const metadata = { title: 'Отклик и резюме' };
export default function Apply() {return <LocaleElement as="div" className="eco-page"><EcoHero label="ОТКЛИК" title="Расскажите о себе." text="Подготовьте резюме и исходные данные для HR. Черновик остаётся в вашем браузере." /><EcoSection><Suspense fallback={<LocaleElement as="p">Загружаем форму…</LocaleElement>}><CareerApplication /></Suspense></EcoSection></LocaleElement>;}
