import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import Link from "@/components/locale/LocaleLink";
import { notFound } from 'next/navigation';
import PageIntro from '@/components/public/PageIntro';
import CorporatePage from '@/components/public/CorporatePage';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import SourceNote from '@/components/public/SourceNote';
import ProjectCTA from '@/components/public/ProjectCTA';
import { manufacturers, manufacturerById } from '@/lib/public/content';
import { enterpriseContacts } from '@/lib/public/company';
import { getManufacturerPhoto } from '@/lib/public/photography';
export const dynamicParams = false;
export function generateStaticParams() {return manufacturers.map((item) => ({ slug: item.id }));}
export async function generateMetadata({ params }) {const item = manufacturerById((await params).slug);return { title: item?.title || 'Предприятие', description: item?.description };}
export default async function ManufacturerPage({ params }) {
  const item = manufacturerById((await params).slug);if (!item) notFound();
  const contact = enterpriseContacts[item.id];
  return <CorporatePage className="corp-manufacturer-detail"><PageIntro label={item.short} parent={{ href: '/manufacturers', label: 'Предприятия' }} eyebrow={item.city} title={item.title} description={item.legal} />
    <CorporatePhoto photo={getManufacturerPhoto(item.id)} className="corp-detail-photo" priority sizes="(max-width: 760px) 100vw, 90vw" />
    <LocaleElement as="section" className="site-editorial-section"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">СПЕЦИАЛИЗАЦИЯ</LocaleElement><LocaleElement as="h2">{item.city}</LocaleElement><LocaleElement as="p" className="site-body-muted">{item.description}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="h2" className="public-section-title">Основные направления</LocaleElement><LocaleElement as="ol" className="public-checklist">{item.capabilities.map((text, index) => <LocaleElement as="li" key={text}><LocaleElement as="span">0{index + 1}</LocaleElement>{text}</LocaleElement>)}</LocaleElement></LocaleElement></LocaleElement>
    <LocaleElement as="div" className="public-inline-actions corp-profile-actions">{item.catalogQuery && <Link className="site-button site-button-primary" href={`/catalog?q=${encodeURIComponent(item.catalogQuery)}`}>Оборудование предприятия <CorporateArrow /></Link>}<LocaleElement as="a" className="site-text-link" href={item.source} target="_blank" rel="noopener noreferrer">Официальный профиль <CorporateArrow /></LocaleElement></LocaleElement>
    <LocaleElement as="section" className="site-editorial-section corp-profile-contact"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">СВЯЗЬ С ПРЕДПРИЯТИЕМ</LocaleElement><LocaleElement as="h2">Адрес и контакты</LocaleElement><LocaleElement as="p" className="site-body-muted">Перед визитом уточните адрес и порядок посещения. Адрес отдела продаж может отличаться от производственной площадки.</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="p" className="site-body-muted">{contact.label}</LocaleElement><address>{contact.city}, {contact.address}</address><LocaleElement as="a" className="site-text-link" href={`tel:${contact.tel}`}>{contact.phone}{contact.extension ? ` · ${contact.extension}` : ''}</LocaleElement><br /><LocaleElement as="a" className="site-text-link" href={`mailto:${contact.email}`}>{contact.email} <CorporateArrow /></LocaleElement></LocaleElement></LocaleElement>
    <SourceNote href={item.source}>Профиль предприятия ALAGEUM Electric</SourceNote><ProjectCTA href={`/inquiry?solution=${encodeURIComponent(item.title)}`} title="Подготовьте запрос предприятию" text="Укажите задачу, параметры оборудования и место поставки. Исполнение и комплектность подтверждаются после рассмотрения исходных данных." />
  </CorporatePage>;
}
