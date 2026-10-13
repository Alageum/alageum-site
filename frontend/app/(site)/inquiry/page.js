import LocaleElement from "@/components/locale/LocaleElement";import { Suspense } from 'react';
import InquiryEntry from '@/components/inquiry/InquiryEntry';
import './inquiry.css';
export const metadata = { title: 'Запрос по проекту', description: 'Подготовьте состав оборудования и описание проекта, сохраните текст запроса или откройте письмо отделу продаж ALAGEUM Electric.' };
export default function InquiryPage() {
  return <Suspense fallback={<LocaleElement as="div" className="catalog-page" role="status">Подготовка формы запроса…</LocaleElement>}><InquiryEntry /></Suspense>;
}
