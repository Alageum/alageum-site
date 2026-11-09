import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import { Story, Hero, Section, Jump, ReadingLinks } from '@/components/public/story/Story';
import { documents } from '@/lib/public/content';

export const metadata = {
  title: 'Документы и каталоги',
  description: 'Корпоративный каталог, список поставок Asia Trafo и технические каталоги оборудования.',
};

const printed = [{
  title: 'Шкафные конструкции',
  description: 'Серии шкафов, технические характеристики, схемы и чертежи.',
  period: '02.09.2024 · каталог в PDF',
  href: '/catalog/source',
  cover: '/photography/stories/document-substations.webp',
}, ...documents.filter(item => item.format === 'PDF').map(item => ({
  ...item,
  cover: item.href.includes('group') ? '/photography/stories/document-group.webp' : '/photography/stories/document-reference.webp',
}))];

export default function Documents() {
  return <Story name="documents">
    <Hero label="Документы" kicker={null} variant="wide" title="Документы и каталоги Alageum Electric" lead="Корпоративный каталог, список поставок Asia Trafo и технические материалы по оборудованию." />
    <Section id="corporate-materials" title="Каталоги и список поставок">
      <div className="story-document-grid">
        {printed.map(item => <article key={item.href}>
          <Image className="story-document-real-cover" src={item.cover} alt={item.title} width={707} height={1000} />
          <div>
            <E as="h3">{item.title}</E>
            <E as="p">{item.description}</E>
            <E as="p" className="story-kicker">{item.period}</E>
            <Jump href={item.href}>{item.href.endsWith('.pdf') ? 'Открыть документ' : 'Читать каталог'}</Jump>
          </div>
        </article>)}
      </div>
    </Section>
    <Section id="technical-catalogs" title="Технический каталог" tone="paper">
      <ReadingLinks items={documents.filter(item => item.format === 'WEB').map(item => [item.href, item.title, item.description])} />
    </Section>
    <Section tone="dark" title="Документы на выбранное оборудование">
      <div className="story-columns">
        <E as="p" className="story-lead">Запросите у производителя паспорт, чертёж, сертификат или протокол испытаний.</E>
        <div className="story-copy">
          <E as="p">В запросе укажите производителя, обозначение изделия, его параметры и нужную редакцию документа.</E>
          <Jump href="mailto:sales@alageum.com?subject=Запрос%20документации">Запросить документацию</Jump>
        </div>
      </div>
    </Section>
    <Section title="Перед использованием документа">
      <div className="story-decision">
        <details open><E as="summary">Проверьте дату и обозначение изделия</E><E as="p">Публикация отражает данные на дату выпуска. Сертификат должен относиться к нужной продукции, а чертёж — к согласованному исполнению.</E></details>
        <details><E as="summary">Согласуйте комплектацию</E><E as="p">Перед заказом согласуйте исполнение и комплектацию с производителем и проектировщиком.</E></details>
      </div>
    </Section>
  </Story>;
}
