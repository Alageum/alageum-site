import {notFound} from 'next/navigation';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import {Story, Hero, Section, Jump, ChapterNav, ReadingLinks} from '@/components/public/story/Story';
import {catalogDirectionById, catalogDirectionHref, getDirectionProducts} from '@/lib/public/catalog-directions';
import {officialProducts} from '@/lib/catalog/data';
import {displayProductName} from '@/lib/catalog/presentation';
import {projectById} from '@/lib/public/content';
import {getManufacturerPhoto} from '@/lib/public/photography';
import {companyPageMetadata} from '@/lib/public/company-metadata';
import '../catalog-directions.css';

export async function generateMetadata({params}) {
  const {slug,locale = 'ru'} = await params;
  const item = catalogDirectionById(slug);
  return item ? companyPageMetadata({title:item.title,description:item.description},catalogDirectionHref(slug),locale) : {title:'Каталог оборудования'};
}
export default async function CatalogDirection({params}) {
  const {slug} = await params;
  const item = catalogDirectionById(slug);
  if (!item) notFound();
  const records = getDirectionProducts(slug,officialProducts);
  const projects = item.projectIds.map(projectById).filter(Boolean);
  const parent = item.parentId ? catalogDirectionById(item.parentId) : null;
  const requestHref = `/inquiry?intent=selection&solution=${encodeURIComponent(item.title)}`;
  return <Story name={`catalog-direction-${slug}`}>
    <Hero label={item.title} title={item.title} lead={item.description} variant={item.photoKey ? 'split' : 'wide'} photo={item.photoKey ? getManufacturerPhoto(item.photoKey) : null} ancestors={parent ? [{label:'Каталог',href:'/catalog/directions'}] : []} parent={parent ? {label:parent.title,href:catalogDirectionHref(parent.id)} : {label:'Каталог',href:'/catalog/directions'}}>
      <div className="catalog-direction-actions">
        {records.length > 0 && <Jump href="#published-series">Серии в каталоге</Jump>}
        <Jump href={requestHref}>Запросить подбор</Jump>
      </div>
    </Hero>
    <ChapterNav items={[["#equipment-types","Виды оборудования"],["#published-series","Серии в каталоге"],["#direction-projects","Проекты"],["#selection-data","Данные для подбора"]]} />
    <Section id="equipment-types" title="Виды оборудования">
      {item.children.length > 0 && <ReadingLinks items={item.children.map(id=>{const child = catalogDirectionById(id);return [catalogDirectionHref(id),child.title,child.description];})} />}
      {item.subtypes.length > 0 && <ul className="catalog-type-list">{item.subtypes.map(type=><E as="li" key={type}>{type}</E>)}</ul>}
    </Section>
    <Section id="published-series" tone="paper" title="Опубликованные серии">
      {records.length ? <ul className="catalog-series-list">{records.map(product=><li key={product.id}><Link href={`/catalog/${encodeURIComponent(product.id)}`}><span>{displayProductName(product)}</span><span aria-hidden="true">↗</span></Link></li>)}</ul> : <E as="p">Технические карточки пока не опубликованы. Исполнение и возможность поставки уточнит отдел продаж по вашему техническому заданию.</E>}
    </Section>
    <Section id="direction-projects" title="Проекты по направлению">
      {projects.length ? <ReadingLinks items={projects.map(project=>[`/projects/${project.id}`,project.title,`${project.description} ${project.note || ''}`])}/> : <E as="p">Проекты с опубликованным составом поставки пока отсутствуют.</E>}
    </Section>
    <Section id="selection-data" tone="paper" title="Что нужно для подбора"><div className="story-columns"><ul className="story-checklist">{item.inputs.map(input=><E as="li" key={input}>{input}</E>)}</ul><div><E as="p">Приложите техническое задание и укажите объект, количество оборудования и желаемый срок поставки.</E><Jump href={requestHref}>Подготовить запрос</Jump><br/><Jump href="/contacts">Контакты отдела продаж</Jump></div></div></Section>
  </Story>;
}
