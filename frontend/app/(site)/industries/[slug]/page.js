import {translateText} from '@/lib/i18n/translate';
import { Fragment } from 'react';
import { notFound } from 'next/navigation';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import { Story, Hero, Section, ChapterNav, Jump, Source, ReadingLinks } from '@/components/public/story/Story';
import { industryById } from '@/lib/public/industries';
import { projectById } from '@/lib/public/content';
import { getProjectPhoto, getManufacturerPhoto, getCorporatePhoto } from '@/lib/public/photography';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import CorporateArrow from '@/components/public/CorporateArrow';
import ProjectGraphic from '@/components/public/ProjectGraphic';
import SolutionCircuit from '@/components/public/story/SolutionCircuit';
import { companyPageMetadata } from '@/lib/public/company-metadata';
import './industry-story.css';

const guides = {
  'power-grid': 'distribution',
  'industry-mining': 'industry',
  'civil-construction': 'infrastructure',
  'infrastructure-transport': 'infrastructure',
};

const presentation = {
  'power-grid': { order: ['equipment', 'projects', 'inputs'] },
  'oil-gas': { variant: 'dark', order: ['projects', 'inputs', 'equipment'] },
  'industry-mining': { order: ['projects', 'equipment', 'inputs'] },
  'civil-construction': { variant: 'wide', order: ['inputs', 'equipment', 'projects'] },
  'infrastructure-transport': { variant: 'dark', order: ['projects', 'equipment', 'inputs'] },
  epc: { variant: 'dark', order: ['inputs', 'partners', 'projects', 'equipment'] },
  renewables: { variant: 'wide', order: ['projects', 'inputs', 'equipment'] },
};

const chapterLinks = {
  equipment: ['#industry-equipment', 'Оборудование'],
  projects: ['#industry-projects', 'Проекты'],
  inputs: ['#industry-inputs', 'Данные для подбора'],
  partners: ['#industry-partners', 'Инжиниринг и проектирование'],
};

const gridCopy = {
  ru: {
    supply: 'Поставка Asia Trafo для подстанции «Нура»',
    project: 'О проекте «Нура»',
    network: 'Оборудование по задаче сети',
    related: 'Другие поставки для сетей',
    tasks: ['Преобразование напряжения', 'Регулирование режима сети', 'Распределение электроэнергии'],
  },
  en: {
    supply: 'Asia Trafo supply for the Nura substation',
    project: 'About the Nura project',
    network: 'Equipment by grid function',
    related: 'Other grid supplies',
    tasks: ['Voltage transformation', 'Grid operating conditions', 'Power distribution'],
  },
  kk: {
    supply: 'Asia Trafo компаниясының «Нұра» қосалқы станциясына жеткізілімі',
    project: '«Нұра» жобасы туралы',
    network: 'Желі міндеттеріне сай жабдық',
    related: 'Электр желілеріне басқа жеткізілімдер',
    tasks: ['Кернеуді түрлендіру', 'Желі режимін реттеу', 'Электр энергиясын тарату'],
  },
};

const gridEquipment = [
  ['power-transformers', 'autotransformers'],
  ['reactors'],
  ['substations', 'high-voltage-switchgear'],
];

export async function generateMetadata({ params }) {
  const { slug, locale = 'ru' } = await params;
  const item = industryById(slug);
  return item ? companyPageMetadata({ title: item.title, description: item.description }, item.href, locale) : {};
}

function SupplyHighlight({ project, copy }) {
  return <div className="industry-supply">
    <E as="p" className="industry-supply-label" data-no-translate>{copy.supply}</E>
    <div className="industry-supply-values">
      <strong>{project.voltage}</strong>
      <strong>{project.metric}</strong>
    </div>
    <E as="p" className="industry-supply-context">{project.location}</E>
    <div className="industry-supply-links">
      <Jump href={`/projects/${project.id}`}><E data-no-translate>{copy.project}</E></Jump>
      <Source href={project.source} period={project.period}>{project.sourceLabel}</Source>
    </div>
  </div>;
}

function EquipmentLink({ id, label }) {
  return <Link href={`/catalog/directions/${id}`}><E>{label}</E><CorporateArrow /></Link>;
}

function EquipmentSection({ item, copy }) {
  const isGrid = item.id === 'power-grid';
  const equipmentNames = new Map(item.equipment.map(([label, id]) => [id, label]));
  return <Section id="industry-equipment" title={isGrid ? <E data-no-translate>{copy.network}</E> : 'Оборудование для этой отрасли'}>
    {isGrid ? (
      <div className="industry-network">
        {gridEquipment.map((ids, index) => <section className="industry-network-stage" key={ids[0]}>
          <E as="h3" data-no-translate>{copy.tasks[index]}</E>
          <ul>{ids.map(id => <li key={id}><EquipmentLink id={id} label={equipmentNames.get(id)} /></li>)}</ul>
        </section>)}
      </div>
    ) : <ul className="industry-equipment-list">{item.equipment.map(([label, id]) =>
      <li key={id}><EquipmentLink id={id} label={label} /></li>
    )}</ul>}
  </Section>;
}

function ProjectCard({ project }) {
  const photo = getProjectPhoto(project.id);
  const href = `/projects/${project.id}`;
  return <article className="public-card corp-project-card">
    <Link className="project-case-visual" href={href} aria-label={project.title}>
      {photo ? <CorporatePhoto photo={photo} caption={false} /> : <ProjectGraphic project={project} />}
    </Link>
    <div className="corp-project-card-body">
      <E as="p" className="site-eyebrow">{project.location}</E>
      <E as="h3"><Link href={href}>{project.title}</Link></E>
      <E as="p">{project.contribution || project.description}</E>
      <E as="p" className="story-note">{project.note}</E>
      <Source href={project.source} period={project.period}>{project.sourceLabel || 'Источник проекта'}</Source>
      <Jump href={href}>Подробнее о проекте</Jump>
    </div>
  </article>;
}

function ProjectsSection({ item, cases, copy }) {
  const isGrid = item.id === 'power-grid';
  const title = isGrid ? <E data-no-translate>{copy.related}</E> : 'Проекты и поставки';
  return <Section id="industry-projects" title={title} tone="paper">
    {item.note && <E as="p" className="story-note">{item.note}</E>}
    {cases.length > 0 && <div className={`public-grid two project-case-grid${isGrid ? ' industry-grid-projects' : ''}`}>
      {cases.map(project => <ProjectCard key={project.id} project={project} />)}
    </div>}
    {item.evidence?.length > 0 && <div className="industry-evidence">
      {item.evidence.map(evidence => <article key={evidence.source}>
        <E as="p" className="site-eyebrow">{evidence.label}</E>
        <E as="h3">{evidence.title}</E>
        <E as="p">{evidence.description}</E>
        <Source href={evidence.source}>Архивная публикация</Source>
      </article>)}
    </div>}
    <Jump href="/projects">Все проекты группы</Jump>
  </Section>;
}

function InputsSection({ item }) {
  return <Section id="industry-inputs" title="Что передать для подбора" className="industry-inputs">
    <div className="story-columns">
      <ol className="story-checklist">{item.inputs.map(input => <E as="li" key={input}>{input}</E>)}</ol>
      <div>
        <E as="p">Укажите известные параметры. Если есть техническое задание или однолинейная схема, приложите их. Состав оборудования и объём работ согласуйте с производителем и проектировщиком.</E>
        <Jump href={`/inquiry?intent=selection&solution=${encodeURIComponent(item.title)}`}>Подготовить запрос на оборудование</Jump>
        <br />
        <Jump href="/contacts">Контакты отдела продаж</Jump>
      </div>
    </div>
  </Section>;
}

export default async function IndustryPage({ params }) {
  const { slug, locale = 'ru' } = await params;
  const item = industryById(slug);
  if (!item) notFound();

  const layout = presentation[item.id];
  const copy = gridCopy[locale] || Object.fromEntries(Object.entries(gridCopy.ru).map(([key, value]) => [key, translateText(value, locale)]));
  const getPhoto = { projects: getProjectPhoto, corporate: getCorporatePhoto, manufacturers: getManufacturerPhoto }[item.photoGroup];
  const photo = getPhoto(item.photoId);
  const highlight = item.id === 'power-grid' ? projectById('nura') : null;
  const cases = item.projectIds.map(projectById).filter(project => project && project.id !== highlight?.id);
  const guide = guides[item.id];
  const sections = {
    equipment: <>
      <EquipmentSection item={item} copy={copy} />
      {guide && <Section title="Схема электроснабжения" className="industry-guide" tone={item.id === 'power-grid' ? 'dark' : ''}>
        <E as="p">Посмотрите, как связаны ввод, трансформатор и распределение электроэнергии на объекте.</E>
        {item.id === 'power-grid' && <SolutionCircuit id={guide} />}
        <Jump href={`/solutions/${guide}`}>Открыть схему и рекомендации по подбору</Jump>
      </Section>}
    </>,
    projects: <ProjectsSection item={item} cases={cases} copy={copy} />,
    inputs: <InputsSection item={item} />,
    partners: item.partners && <Section id="industry-partners" title="Инжиниринг и проектирование"><ReadingLinks items={item.partners} /></Section>,
  };
  return <Story name={`industry-${item.id} industry-story`}>
    <Hero label={item.title} kicker={null} parent={{ href: '/industries', label: 'Отрасли' }} title={item.title} lead={item.description} photo={photo} variant={layout.variant}>
      {highlight && <SupplyHighlight project={highlight} copy={copy} />}
    </Hero>
    <ChapterNav items={layout.order.map(section => chapterLinks[section])} />
    {layout.order.map(section => <Fragment key={section}>{sections[section]}</Fragment>)}
  </Story>;
}
