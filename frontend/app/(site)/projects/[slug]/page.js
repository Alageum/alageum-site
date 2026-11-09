import E from '@/components/locale/LocaleElement';
import ProjectValue from '@/components/public/story/ProjectValue';
import { notFound } from 'next/navigation';
import { Story, Hero, Section, Jump, Source } from '@/components/public/story/Story';
import { projectTypeLabel } from '@/lib/public/project-cases';
import { projects, projectById } from '@/lib/public/content';
import { getProjectPhoto } from '@/lib/public/photography';
import './project-story.css';

export const dynamicParams = false;

export function generateStaticParams() {
  return projects.map(item => ({ slug: item.id }));
}

export async function generateMetadata({ params }) {
  const item = projectById((await params).slug);
  return { title: item?.title || 'Проект', description: item?.description };
}

export default async function Project({ params }) {
  const item = projectById((await params).slug);
  if (!item) notFound();
  const photo = getProjectPhoto(item.id);
  const supply = item.kind === 'supply';
  const variant = supply ? photo ? 'split' : 'wide' : 'dark';
  const facts = item.facts?.filter(fact => fact.value !== item.metric);
  const title = supply ? 'Оборудование для объекта' : 'Задача проекта';

  return <Story name={`case case-${item.kind} project-story`}>
    <Hero label={item.title} kicker={projectTypeLabel(item.kind)} parent={{ href: '/projects', label: 'Проекты' }} variant={variant} photo={photo} title={item.title} lead={supply ? item.location : item.description}>
      <div className="project-summary">
        <div className="project-summary-data">
          <strong><ProjectValue value={item.metric} /></strong>
          <E as="p">{item.metricLabel}</E>
        </div>
        <div className="project-summary-scope">
          {!supply && <E as="p">{item.location}</E>}
          <E as="p">{item.role}</E>
          <E as="p">{item.label || item.period}</E>
        </div>
      </div>
    </Hero>
    <Section id="project-work" title={title}>
      <div className="story-columns project-scope">
        <E as="p" className="project-context">{item.context}</E>
        <div className="story-copy">
          {supply && <E as="p">{item.description}</E>}
          <E as="p">{item.contribution}</E>
        </div>
      </div>
    </Section>
    {facts?.length > 0 && <Section id="project-specifications" tone="paper" label="ДЕТАЛИ ПОСТАВКИ">
      <dl className="story-facts">
        {facts.map(fact => <div key={fact.label}><E as="dt">{fact.label}</E><E as="dd">{fact.value}</E></div>)}
      </dl>
    </Section>}
    <Section id="project-documents" label="ДОКУМЕНТЫ ПРОЕКТА" title={supply ? 'Сведения о поставке' : 'Работы и документация'}>
      <div className="story-columns">
        <div>
          {item.voltage !== item.metric && <E as="h3">{item.voltage}</E>}
          <Source href={item.source} period={item.period}>{item.sourceLabel}</Source>
        </div>
        <div className="story-copy">
          <E as="p">{item.note}</E>
          <Jump href="/projects">Все проекты</Jump>
        </div>
      </div>
    </Section>
  </Story>;
}
