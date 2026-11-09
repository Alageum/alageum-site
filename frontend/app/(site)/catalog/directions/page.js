import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import {Story, Hero, Section, Jump} from '@/components/public/story/Story';
import {topCatalogDirections, catalogDirectionById, catalogDirectionHref} from '@/lib/public/catalog-directions';
import {getCorporatePhoto} from '@/lib/public/photography';
import {companyPageMetadata} from '@/lib/public/company-metadata';
import './catalog-directions.css';

export async function generateMetadata({params}) {
  const {locale = 'ru'} = await params;
  return companyPageMetadata({title:'Каталог оборудования по направлениям',description:'Трансформаторы, подстанции, распределительные устройства, автоматика и комплектующие.'},'/catalog/directions',locale);
}
export default function CatalogDirections() {
  return <Story name="catalog-directions">
    <Hero label="Каталог" title="Каталог оборудования" lead="Выберите тип оборудования, чтобы посмотреть доступные серии, характеристики и проекты поставок." photo={getCorporatePhoto('category-transformers')}>
      <Jump href="/catalog">Весь каталог</Jump>
    </Hero>
    <Section title="Направления каталога">
      <div className="catalog-directory-grid">{topCatalogDirections.map((item,index)=><article key={item.id}>
        <span className="catalog-directory-index" aria-hidden="true">{String(index + 1).padStart(2,'0')}</span>
        <E as="h3"><Link href={catalogDirectionHref(item.id)}>{item.title} <span aria-hidden="true">↗</span></Link></E>
        <E as="p">{item.description}</E>
        {item.children.length > 0 && <ul>{item.children.map(id=><li key={id}><Link href={catalogDirectionHref(id)}>{catalogDirectionById(id).title}</Link></li>)}</ul>}
      </article>)}</div>
    </Section>
  </Story>;
}
