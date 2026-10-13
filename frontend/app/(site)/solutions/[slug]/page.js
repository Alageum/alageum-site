import LocaleElement from "@/components/locale/LocaleElement";import Link from "@/components/locale/LocaleLink";
import { notFound } from 'next/navigation';
import { solutions, solutionById } from '@/lib/public/solutions';
import CorporateArrow from '@/components/public/CorporateArrow';
import CorporatePage from '@/components/public/CorporatePage';
import PageIntro from '@/components/public/PageIntro';
import ProjectCTA from '@/components/public/ProjectCTA';
import AnimatedProjectInputs from '@/components/public/AnimatedProjectInputs';
export const dynamicParams = false;
export function generateStaticParams() {return solutions.map((item) => ({ slug: item.id }));}
export async function generateMetadata({ params }) {const item = solutionById((await params).slug);return { title: item?.title || 'Решение', description: item?.description };}
export default async function SolutionPage({ params }) {
  const item = solutionById((await params).slug);if (!item) notFound();
  return <CorporatePage><PageIntro label={item.title} parent={{ href: '/solutions', label: 'Решения' }} eyebrow="НАПРАВЛЕНИЕ РАБОТЫ" title={item.title} description={item.description} />
    <LocaleElement as="section" className="site-editorial-section"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">01 / ОБСУЖДЕНИЕ ПРОЕКТА</LocaleElement><LocaleElement as="h2">С чего начать<br />разговор</LocaleElement><LocaleElement as="p" className="site-body-muted">Эти исходные данные помогут обсудить задачу с инженерной командой и определить требования к оборудованию.</LocaleElement></LocaleElement><AnimatedProjectInputs inputs={item.inputs} /></LocaleElement>
    <LocaleElement as="section" className="public-section"><LocaleElement as="div" className="home-section-heading"><LocaleElement as="p" className="site-eyebrow">02 / ОБОРУДОВАНИЕ</LocaleElement><LocaleElement as="h2">Группы для рассмотрения</LocaleElement><Link href={`/catalog?category=${item.category}`} className="site-text-link">Открыть каталог <CorporateArrow direction="right" /></Link></LocaleElement><LocaleElement as="p" className="corp-section-intro">Окончательное исполнение и состав поставки определяются проектом и подтверждаются производителем.</LocaleElement><LocaleElement as="div" className="public-grid three">{item.equipment.map((name) => <LocaleElement as="article" className="public-card" key={name}><LocaleElement as="p" className="site-eyebrow">ОБОРУДОВАНИЕ ПРЕДПРИЯТИЙ</LocaleElement><LocaleElement as="h3">{name}</LocaleElement><Link href={`/catalog?category=${item.category}`} className="site-text-link">Перейти к подбору <CorporateArrow /></Link></LocaleElement>)}</LocaleElement></LocaleElement>
    <ProjectCTA href={`/inquiry?intent=selection&solution=${item.id}`} title="Подготовьте исходные данные" text="Соберите описание объекта, требования и перечень оборудования в один запрос для обсуждения с менеджером." /><LocaleElement as="p" className="public-source">Рекомендации по подготовке запроса составлены для этой версии сайта; они не являются готовым инженерным решением.</LocaleElement>
  </CorporatePage>;
}
