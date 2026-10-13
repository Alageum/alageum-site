import LocaleElement from "@/components/locale/LocaleElement";import Link from "@/components/locale/LocaleLink";
import { notFound } from 'next/navigation';
import PageIntro from '@/components/public/PageIntro';
import CorporatePage from '@/components/public/CorporatePage';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import SourceNote from '@/components/public/SourceNote';
import ProjectCTA from '@/components/public/ProjectCTA';
import ProjectGraphic from '@/components/public/ProjectGraphic';
import { projectTypeLabel } from '@/lib/public/project-cases';
import { projects, projectById } from '@/lib/public/content';
import { getProjectPhoto } from '@/lib/public/photography';
export const dynamicParams = false;
export function generateStaticParams() {return projects.map((item) => ({ slug: item.id }));}
export async function generateMetadata({ params }) {const item = projectById((await params).slug);return { title: item?.title || 'Проект', description: item?.description };}
export default async function ProjectPage({ params }) {
  const item = projectById((await params).slug);if (!item) notFound();
  const photo = getProjectPhoto(item.id);
  return <CorporatePage className="corp-project-detail"><PageIntro label={item.title} parent={{ href: '/projects', label: 'Проекты' }} eyebrow={item.label} title={item.title} description={item.location} />
    <LocaleElement as="div" className="project-detail-meta"><LocaleElement as="span">{projectTypeLabel(item.kind)}</LocaleElement><LocaleElement as="span">{item.role}</LocaleElement><LocaleElement as="span">{item.period}</LocaleElement></LocaleElement>
    {photo ? <CorporatePhoto photo={photo} className="corp-detail-photo" priority sizes="(max-width: 760px) 100vw, 90vw" /> : <ProjectGraphic project={item} />}
    <LocaleElement as="div" className="project-detail-facts">{(item.facts || [{ value: item.metric, label: item.metricLabel }, { value: item.location, label: "География" }, { value: projectTypeLabel(item.kind), label: "Вид работ" }]).map((fact) => <LocaleElement as="div" key={fact.label}><LocaleElement as="strong">{fact.value}</LocaleElement><LocaleElement as="span">{fact.label}</LocaleElement></LocaleElement>)}</LocaleElement>
    <LocaleElement as="section" className="site-editorial-section"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">ПАРАМЕТРЫ ПРОЕКТА</LocaleElement><LocaleElement as="h2" className="corp-detail-stat">{item.voltage}</LocaleElement><LocaleElement as="p" className="site-body-muted">{item.context}</LocaleElement><LocaleElement as="p" className="site-body-muted">{item.label}</LocaleElement></LocaleElement><LocaleElement as="div" className="site-editorial-copy"><LocaleElement as="h2">Участие предприятий группы</LocaleElement><LocaleElement as="p">{item.description}</LocaleElement><LocaleElement as="p">{item.contribution}</LocaleElement><LocaleElement as="div" className="public-note"><LocaleElement as="strong">Статус и объём сведений</LocaleElement><LocaleElement as="p">{item.note}</LocaleElement></LocaleElement></LocaleElement></LocaleElement>
    <SourceNote href={item.source}>{item.sourceLabel}</SourceNote>
    <ProjectCTA title="Обсудим параметры вашего объекта" text="Назовите задачу, требуемую мощность и условия площадки. Техническое исполнение и комплект поставки определяются отдельно для каждого проекта." />
    <Link className="site-text-link corp-related-link" href="/projects">← Все проекты и поставки</Link>
  </CorporatePage>;
}
