import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import {Story, Hero, Section, Jump} from '@/components/public/story/Story';
import {catalogEquipmentGroups, catalogDirectionById, catalogDirectionHref} from '@/lib/public/catalog-directions';
import {getCorporatePhoto} from '@/lib/public/photography';
import {companyPageMetadata} from '@/lib/public/company-metadata';
import {CatalogEquipmentLayout} from '@/components/catalog/CatalogEquipmentNavigation';
import './catalog-directions.css';

export async function generateMetadata({params}) {
  const {locale = 'ru'} = await params;
  return companyPageMetadata({title:'Каталог оборудования по направлениям',description:'Трансформаторы, подстанции, распределительные устройства, автоматика и комплектующие.'},'/catalog/directions',locale);
}
export default function CatalogDirections() {
  return <CatalogEquipmentLayout><Story name="catalog-directions">
    <Hero label="Каталог" title="Каталог оборудования" lead="Выберите тип оборудования, чтобы посмотреть доступные серии, характеристики и проекты поставок." photo={getCorporatePhoto('category-transformers')}>
      <Jump href="/catalog">Весь каталог</Jump>
    </Hero>
    <Section title="Направления каталога">
      <div className="catalog-directory-grid">
        {catalogEquipmentGroups.map(({ label, items }) => <article key={label}>
          <E as="h3">{label}</E>
          <ul>{items.map(({ id, label }) => <li key={id}>
            <Link href={catalogDirectionHref(id)}>{label ?? catalogDirectionById(id).title}</Link>
          </li>)}</ul>
        </article>)}
      </div>
    </Section>
  </Story></CatalogEquipmentLayout>;
}
