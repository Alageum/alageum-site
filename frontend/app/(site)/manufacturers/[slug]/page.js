import {PhotoEssay} from '@/components/public/story/Visuals';
import {factoryPhotoEssays} from '@/lib/public/engineering-photography';
import FactoryFact from '@/components/public/story/FactoryFact';
import E from '@/components/locale/LocaleElement';
import { notFound } from 'next/navigation';
import { Story, Hero, Section, Jump, Source, ChapterNav } from '@/components/public/story/Story';
import { manufacturers, manufacturerById } from '@/lib/public/content';
import { enterpriseContacts } from '@/lib/public/company';
import { factoryDossiers } from '@/lib/public/factory-dossiers';
import FactoryFocus from '@/components/public/story/FactoryFocus';
import { getManufacturerPhoto } from '@/lib/public/photography';
import EnterpriseResearch from '@/components/public/EnterpriseResearch';
import './factory-profile.css';

const profiles = {
  ktz: { layout: 'editorial', profile: 'Силовые и измерительные трансформаторы', process: 'Трансформаторное производство и обучение' },
  'asia-trafo': { layout: 'panorama', profile: 'Силовые трансформаторы и реакторы', process: 'От расчёта к производству трансформатора' },
  utz: { layout: 'reverse', profile: 'Трансформаторы и комплектные подстанции', process: 'Как устроен герметичный трансформатор', processFirst: true },
  petz: { layout: 'gallery', profile: 'Оборудование для распределительных сетей', process: 'Kaizen на производстве', processFirst: true },
  aemz: { layout: 'editorial', profile: 'Распределительное оборудование 0,4–35 кВ', process: 'Металлообработка и сборка оборудования', processFirst: true },
  elmo: { layout: 'panorama', profile: 'Масштаб инженерных работ', process: 'Проектирование, монтаж и пусконаладка', processFirst: true },
  'batys-electric': { layout: 'gallery', profile: 'Блочные комплектные подстанции', process: 'Бетонный корпус и электротехническая часть' },
  'ural-electric': { layout: 'reverse', profile: 'Распределительное оборудование и провод', process: 'Корпуса оборудования и эмалированный провод' },
};

export const dynamicParams = false;
export function generateStaticParams() {
  return manufacturers.map(item => ({ slug: item.id }));
}

export async function generateMetadata({ params }) {
  const item = manufacturerById((await params).slug);
  return { title: item?.title || 'Предприятие', description: item?.description };
}

export default async function ManufacturerPage({ params }) {
  const item = manufacturerById((await params).slug);
  if (!item) notFound();

  const dossier = factoryDossiers[item.id];
  const contact = enterpriseContacts[item.id];
  const profile = profiles[item.id];
  const variant = profile.layout === 'panorama' ? 'dark' : profile.layout === 'gallery' ? 'wide' : 'split';
  const chapters = [
    ['#factory-profile', 'Профиль'],
    ['#factory-process', dossier.focus],
  ];
  if (profile.processFirst) chapters.reverse();

  const [headline, ...otherFacts] = dossier.facts;
  const overview = (
    <Section id="factory-profile" title={profile.profile} className="factory-overview">
      {otherFacts.length > 0 && <dl className="factory-specs">
        {otherFacts.map(fact => (
          <div key={fact.label}>
            <E as="dt">{fact.label}</E>
            <E as="dd">{fact.value}</E>
            <dd className="factory-fact-period"><E as="small">{fact.period}</E></dd>
          </div>
        ))}
      </dl>}
      <Source href={dossier.source} period="Характеристики приведены по профилю предприятия. Дата обновления в источнике не указана. Сверено 1 ноября 2026 года." />
    </Section>
  );
  const production = (
    <Section id="factory-process" title={profile.process} tone="paper">
      <FactoryFocus id={item.id} />
      {factoryPhotoEssays[item.id] && <PhotoEssay photos={factoryPhotoEssays[item.id]} />}
      <div className="story-dossier">
        <div className="story-process">
          {dossier.chapters.filter((_, index) => item.id !== 'utz' || index !== 0).map(([title, text]) => (
            <article key={title}><E as="h3">{title}</E><E as="p">{text}</E></article>
          ))}
          <Jump href={dossier.related[0]}>{dossier.related[1]}</Jump>
          <EnterpriseResearch id={item.id} />
        </div>
        <aside>
          <E as="h3">{item.id === 'elmo' ? 'Виды работ' : 'Продукция'}</E>
          <ul className="story-checklist">{item.capabilities.map(text => <E as="li" key={text}>{text}</E>)}</ul>
          {item.catalogQuery && <Jump href={`/catalog?q=${encodeURIComponent(item.catalogQuery)}`}>Оборудование предприятия</Jump>}
        </aside>
      </div>
    </Section>
  );

  return (
    <Story name={`factory factory-${item.id} factory-layout-${profile.layout}`}>
      <Hero label={item.title} kicker={null} parent={{ href: '/manufacturers', label: 'Предприятия' }}
        title={item.title} lead={dossier.text} photo={getManufacturerPhoto(item.id)} variant={variant}>
        <E as="p" className="factory-location">{item.city} · {item.legal}</E>
        <dl className="factory-headline-fact">
          <div>
            <E as="dt">{headline.label}</E>
            <E as="dd"><FactoryFact value={headline.value} /></E>
            <dd className="factory-fact-period"><E as="small">{headline.period}</E></dd>
          </div>
        </dl>
        <Jump href={chapters[0][0]}>{chapters[0][1]}</Jump>
      </Hero>
      <ChapterNav items={[...chapters, ['#factory-contact', 'Контакты']]} />
      {profile.processFirst ? <>{production}{overview}</> : <>{overview}{production}</>}
      <Section id="factory-contact" title="Контакты предприятия">
        <div className="story-columns factory-contact">
          <div>
            <E as="p">{contact.label}</E>
            <E as="address">{contact.city}, {contact.address}</E>
            <div className="factory-contact-links">
              <Jump href={`tel:${contact.tel}`}>{contact.phone}{contact.extension ? ` · ${contact.extension}` : ''}</Jump>
              <Jump href={`mailto:${contact.email}`}>{contact.email}</Jump>
            </div>
          </div>
          <div className="story-copy">
            <E as="p">Напишите, какое оборудование вам нужно. Перед визитом договоритесь о встрече.</E>
            <Jump href={`/inquiry?solution=${encodeURIComponent(item.title)}`}>Подготовить запрос</Jump>
            <Jump href="/contacts">Контакты группы</Jump>
          </div>
        </div>
      </Section>
    </Story>
  );
}
