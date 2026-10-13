import LocaleElement from "@/components/locale/LocaleElement";import CorporatePage from '@/components/public/CorporatePage';
import { Suspense } from 'react';
import PageIntro from '@/components/public/PageIntro';
import EnterpriseDirectory from '@/components/public/EnterpriseDirectory';
import { CorporateCTA } from '@/components/public/CorporateParts';
import '../../company-pages.css';
export const metadata = { title: 'География предприятий', description: 'Предприятия ALAGEUM Electric в Кентау, Шымкенте, Алматы, Уральске и Петропавловске. Специализация, адреса и официальные контакты.' };
export default function ManufacturersPage() {
  return <CorporatePage><PageIntro label="Предприятия" eyebrow="ГЕОГРАФИЯ ГРУППЫ" title={<>Предприятия группы.<br /><LocaleElement as="span" className="corp-heading-muted">География компетенций.</LocaleElement></>} description="Трансформаторное и электротехническое производство, инжиниринг и строительство. Познакомьтесь со специализацией предприятий и выберите контакт по городу." /><Suspense fallback={<LocaleElement as="p" className="corp-loading" role="status">Загружаем географию предприятий…</LocaleElement>}><EnterpriseDirectory /></Suspense><CorporateCTA title={<>Найдём компетенцию<br />для вашего проекта.</>} /></CorporatePage>;
}
