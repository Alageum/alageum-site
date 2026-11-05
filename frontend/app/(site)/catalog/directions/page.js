import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import {Story, Hero, Section, Jump} from '@/components/public/story/Story';
import {topCatalogDirections, catalogDirectionById, catalogDirectionHref} from '@/lib/public/catalog-directions';
import {getCorporatePhoto} from '@/lib/public/photography';
import {companyPageMetadata} from '@/lib/public/company-metadata';

export async function generateMetadata({params}) {
  const {locale = 'ru'} = await params;
  return companyPageMetadata({title:'Каталог оборудования по направлениям',description:'Трансформаторы, подстанции, распределительные устройства, автоматика и комплектующие.'},'/catalog/directions',locale);
}
export default function CatalogDirections() {
  return <Story name="catalog-directions">
    <Hero label="Каталог" title="Каталог оборудования" lead="Выберите тип оборудования. На странице направления собраны опубликованные серии, параметры для подбора и связанные проекты." photo={getCorporatePhoto('category-transformers')} />
    <Section title="Направления каталога">
      <div className="story-ledger">{topCatalogDirections.map((item,index)=><article key={item.id}>
        <E as="span" className="story-index">{String(index + 1).padStart(2,'0')}</E>
        <div><E as="h2">{item.title}</E><E as="p">{item.description}</E></div>
        <div>{item.children.length > 0 && <ul className="story-checklist">{item.children.map(id=><li key={id}><Link href={catalogDirectionHref(id)}>{catalogDirectionById(id).title}</Link></li>)}</ul>}<Jump href={catalogDirectionHref(item.id)}>Открыть направление</Jump></div>
      </article>)}</div>
    </Section>
    <Section tone="paper" title="Знаете обозначение оборудования?"><E as="p" className="story-lead">В техническом каталоге можно искать по серии, мощности и напряжению, сравнивать позиции и сохранять подборку.</E><Jump href="/catalog">Открыть технический каталог</Jump></Section>
  </Story>;
}
