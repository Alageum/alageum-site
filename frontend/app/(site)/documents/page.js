import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporateArrow from '@/components/public/CorporateArrow';
import HomeContactForm from '@/components/public/HomeContactForm';
import { catalogDirectionById, catalogDirectionHref, topCatalogDirections } from '@/lib/public/catalog-directions';
import { documents } from '@/lib/public/content';
import '@/components/public/corporate-home.css';
import styles from './designers.module.css';

export const metadata = {
  title: 'Проектировщикам · Alageum Electric',
  description: 'Каталоги, параметры оборудования и запрос технической документации для проекта.',
};

const groups = [
  { id: 'transformers', title: 'Трансформаторы', directions: ['power-transformers', 'autotransformers', 'furnace-transformers', 'oil-dry-transformers', 'instrument-transformers'] },
  { id: 'reactors', title: 'Реакторы', directions: ['reactors'] },
  { id: 'substations', title: 'Подстанции', directions: ['substations'] },
  { id: 'switchgear', title: 'Распределительное оборудование', directions: ['high-voltage-switchgear', 'low-voltage-switchgear', 'gis', 'high-voltage-switching'] },
  { id: 'control', title: 'Автоматика и комплектующие', directions: ['relay-protection', 'cable-systems', 'electrical-components'] },
];
const files = [
  {
    title: 'Шкафные конструкции',
    description: 'Серии шкафов, технические характеристики, схемы и чертежи.',
    period: '02.09.2024',
    href: '/catalog/source',
    action: 'Читать каталог',
  },
  ...documents.filter(item => item.format === 'PDF').map(item => ({ ...item, action: 'Открыть PDF' })),
];

export default function Documents() {
  return <div className={`site-container ${styles.page}`}>
    <E as="nav" className={styles.sidebar} aria-label="Разделы для проектировщиков">
      <Link href="#technical-catalogs">Оборудование</Link>
      <ul>
        {groups.map(group => <li key={group.id}><Link href={`#${group.id}`}>{group.title}</Link></li>)}
      </ul>
      <Link href="#corporate-materials">Каталоги и список поставок</Link>
      <Link href="#documentation-request">Запросить документацию</Link>
    </E>
    <div className={styles.content}>
      <header className={styles.hero}>
        <E as="p" className="site-eyebrow">ALAGEUM ELECTRIC</E>
        <E as="h1">Проектировщикам</E>
        <E as="p">Найдите серию оборудования и её характеристики, откройте каталог или запросите документы для конкретного исполнения.</E>
        <div className={styles.actions}>
          <Link className="site-button site-button-primary" href="#documentation-request">Запросить документацию <CorporateArrow /></Link>
          <Link className="site-button" href="#corporate-materials">Каталоги и список поставок <CorporateArrow direction="down" /></Link>
        </div>
      </header>

      <section id="technical-catalogs" className={styles.section} aria-labelledby="designer-equipment">
        <div className={styles.sectionHeading}>
          <E as="h2" id="designer-equipment">Оборудование</E>
          <Link className="site-text-link" href="/catalog">Весь каталог <CorporateArrow /></Link>
        </div>
        <div className={styles.groups}>
          {groups.map(group => <section key={group.id} id={group.id} className={styles.group}>
            <E as="h3">{group.title}</E>
            <ul>
              {group.directions.map(id => {
                const direction = catalogDirectionById(id);
                return <li key={id}><Link href={catalogDirectionHref(id)}>{direction.title} <CorporateArrow /></Link></li>;
              })}
            </ul>
          </section>)}
        </div>
      </section>

      <section id="corporate-materials" className={styles.section} aria-labelledby="designer-materials">
        <div className={styles.sectionHeading}><E as="h2" id="designer-materials">Каталоги и список поставок</E></div>
        <ul className={styles.files}>
          {files.map(file => <li key={file.href}>
            <div><E as="h3">{file.title}</E><E as="p">{file.description}</E><E as="small">{file.period}</E></div>
            <Link className="site-text-link" href={file.href}>{file.action} <E as="span" className={styles.srOnly}>{file.title}</E><CorporateArrow /></Link>
          </li>)}
        </ul>
        <E as="p" className={styles.note}>Перед использованием проверьте дату документа и обозначение изделия. Чертёж должен соответствовать согласованному исполнению.</E>
      </section>

      <div className={styles.request}>
        <HomeContactForm equipment={topCatalogDirections.map(({ id, title }) => ({ id, title }))} />
      </div>
    </div>
  </div>;
}
