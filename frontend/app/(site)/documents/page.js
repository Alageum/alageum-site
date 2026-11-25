import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporateArrow from '@/components/public/CorporateArrow';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import { documents } from '@/lib/public/content';
import { designerQuestionnaires } from '@/lib/public/designer-questionnaires';
import { getManufacturerPhoto } from '@/lib/public/photography';
import '@/components/public/corporate-home.css';
import DesignerWorkspace from './DesignerWorkspace';
import styles from './designers.module.css';

export const metadata = {
  title: 'Проектировщикам · Alageum Electric',
  description: 'Опросные листы, технические каталоги и запрос документации на оборудование Alageum Electric.',
};

const catalogues = [
  { title: 'Каталог трансформаторов', description: 'Печатное техническое издание · 187 страниц', href: '/documents/transformers-2026-print.pdf' },
  { title: 'Каталог подстанций и шкафных конструкций', description: 'Печатное техническое издание · 104 страницы', href: '/documents/substations-local-edition.pdf' },
  ...documents.filter(item => item.format === 'PDF'),
];

export default function Documents() {
  return <div className={`site-container ${styles.page}`}>
    <header className={styles.hero}>
      <div className={styles.heroCopy}>
        <E as="nav" className={styles.breadcrumbs} aria-label="Хлебные крошки">
          <Link href="/">Alageum</Link><span aria-hidden="true">/</span><E aria-current="page">Проектировщикам</E>
        </E>
        <E as="h1">Проектировщикам</E>
        <E as="p">Подберите оборудование, скачайте опросный лист или запросите документацию для проекта.</E>
        <div className={styles.actions}>
          <Link className="site-button site-button-primary" href="#documentation-request">Запросить документацию <CorporateArrow /></Link>
          <Link className="site-button" href="#questionnaires">Опросные листы <CorporateArrow direction="down" /></Link>
        </div>
      </div>
      <CorporatePhoto photo={getManufacturerPhoto('asia-trafo')} className={styles.heroPhoto} priority sizes="(max-width: 800px) 100vw, 42vw" />
    </header>

    <E as="nav" className={styles.sectionNav} aria-label="На этой странице">
      <Link href="#technical-catalogs">Оборудование</Link>
      <Link href="#questionnaires">Опросные листы</Link>
      <Link href="#corporate-materials">Каталоги и список поставок</Link>
      <Link href="#documentation-request">Заявка на документацию</Link>
    </E>

    <DesignerWorkspace>
      <section id="questionnaires" className={styles.section} aria-labelledby="designer-questionnaires">
        <div className={styles.sectionHeading}><E as="h2" id="designer-questionnaires">Опросные листы</E></div>
        <E as="p" className={styles.lead}>Скачайте бланк для нужной модели и заполните параметры объекта.</E>
        <div className={styles.questionnaires}>
          {designerQuestionnaires.map(({ id, title, files }) => (
            <details key={id} className={styles.questionnaireGroup}>
              <summary><E>{title}</E><span className={styles.count}>{files.length}</span><span className={styles.chevron} aria-hidden="true" /></summary>
              <ul className={styles.files}>
                {files.map(([name, file]) => (
                  <li key={file}>
                    <E>{name}</E>
                    <E as="a" href={`/documents/questionnaires/${file}`} download aria-label={`Скачать опросный лист ${name}`}>
                      <E as="small">{file.split('.').at(-1).toUpperCase()}</E><CorporateArrow direction="down" />
                    </E>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      </section>

      <section id="corporate-materials" className={styles.section} aria-labelledby="designer-materials">
        <div className={styles.sectionHeading}><E as="h2" id="designer-materials">Каталоги и список поставок</E></div>
        <ul className={styles.files}>
          {catalogues.map(file => <li key={file.href}>
            <div><E as="h3">{file.title}</E><E as="p">{file.description}</E></div>
            <E as="a" href={file.href} target="_blank" rel="noopener noreferrer" aria-label={`${file.title} (PDF)`}><E as="small">PDF</E><CorporateArrow /></E>
          </li>)}
        </ul>
        <E as="p" className={styles.note}>Габариты, схемы и комплектация зависят от исполнения. Для рабочей документации запросите чертежи по параметрам вашего проекта.</E>
      </section>
    </DesignerWorkspace>
  </div>;
}
