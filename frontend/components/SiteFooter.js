'use client';
import {translateText} from '@/lib/i18n/translate';

import {usePathname} from '@/components/locale/navigation';
import {useLocale, useTranslate} from '@/components/locale/LocaleProvider';
import {ecosystemArea} from '@/components/locale/EcosystemNavigation';
import {careerFooterGroups} from '@/components/careers/navigation';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import styles from './SiteFooter.module.css';

const homeLinks = [
  ['Компания', '/company'], ['Предприятия', '/manufacturers'], ['Каталог', '/catalog'], ['Контакты', '/contacts'],
];
const companyGroups = [
  ['Компания', [
    ['О компании', '/company'], ['Предприятия и производство', '/manufacturers'],
    ['Руководство', '/company/team'], ['Социальная ответственность', '/company/social'], ['Новости', '/news'], ['Материалы компании', '/materials'],
  ]],
  ['Продукция и проекты', [
    ['Отрасли', '/industries'], ['Каталог продукции', '/catalog'], ['Проекты', '/projects'], ['Документы', '/documents'],
  ]],
  ['Связь', [['Контакты', '/contacts'], ['Карьера', '/careers'], ['Инвесторам', '/investors']]],
];
const catalogGroups = [
  ['Продукция', [
    ['Трансформаторы', '/catalog?category=transformers'], ['Распределительные устройства', '/catalog?category=switchgear'],
    ['Подстанции', '/catalog?category=substations'], ['Весь каталог', '/catalog'],
  ]],
  ['Кабинет клиента', [
    ['Мои проекты', '/client/projects'], ['Запросы и заказы', '/client/orders'], ['Документы', '/client/documents'], ['Поддержка', '/client/support'],
  ]],
  ['Компания', [['О компании', '/company'], ['Производители', '/manufacturers'], ['Контакты', '/contacts'], ['Карьера', '/careers']]],
];
const wording = {
  ru: {description: 'Электротехническое оборудование и инжиниринг', products: 'Продукция и проекты', contact: 'Отдел продаж', hr: 'Вопросы о работе', candidates: 'Кандидатам', navigation: 'Разделы сайта', policy: 'Данные и приватность', brand: 'Alageum Electric — главная'},
  en: {description: 'Electrical equipment and engineering', products: 'Products & projects', contact: 'Sales', hr: 'Careers enquiries', candidates: 'For applicants', navigation: 'Site navigation', policy: 'Data & privacy', brand: 'Alageum Electric — home'},
  kk: {description: 'Электротехникалық жабдық және инжиниринг', products: 'Өнімдер мен жобалар', contact: 'Сату бөлімі', hr: 'Жұмыс туралы сұрақтар', candidates: 'Үміткерлерге', navigation: 'Сайт бөлімдері', policy: 'Деректер және құпиялық', brand: 'Alageum Electric — басты бет'},
};

export default function SiteFooter() {
  const pathname = usePathname();
  const area = ecosystemArea(pathname);
  const isCareer = area === 'careers';
  const tx = useTranslate();
  const locale = useLocale();
  const text = wording[locale] || Object.fromEntries(Object.entries(wording.ru).map(([key, value]) => [key, translateText(value, locale)]));
  const groups = isCareer ? careerFooterGroups : area === 'catalog' ? catalogGroups : companyGroups;
  const section = tx(isCareer ? 'Карьера' : area === 'catalog' ? 'Каталог' : 'Компания');
  const groupTitle = title => title === 'Продукция и проекты' ? text.products : title === 'Кандидатам' ? text.candidates : tx(title);

  return <footer className={`site-footer ${styles.footer}`}>
    <div className={`site-container ${styles.container}`}>
      <div className={styles.identityRow}>
        <div className={styles.identity}>
          <Link href="/" className={styles.logoLink} aria-label={text.brand} data-no-translate>
            <Image src="/brand/logo-lettering-01-white.svg" alt="Alageum Electric" width={154} height={47} className={styles.logo}/>
          </Link>
          <div className={styles.identityText}><span className={styles.section}>{section}</span><p>{text.description}</p></div>
        </div>
        <div className={styles.contact}>
          <span className={styles.contactLabel}>{isCareer ? text.hr : text.contact}</span>
          <div className={styles.channels}>
            {!isCareer && <a href="tel:+77710052222" className={styles.phone}>+7 771 005 22 22</a>}
            <a href={isCareer ? 'mailto:cv@alageum.com' : 'mailto:sales@alageum.com'} className={isCareer ? styles.phone : styles.email}>
              {isCareer ? 'cv@alageum.com' : 'sales@alageum.com'}<span aria-hidden="true">↗</span>
            </a>
          </div>
        </div>
      </div>
      {pathname === '/' ? <nav className={`${styles.group} ${styles.homeNavigation}`} aria-label={text.navigation}>
        <ul>{homeLinks.map(([label, href]) => <li key={href}><Link href={href}>{label}</Link></li>)}</ul>
      </nav> : <div className={styles.navigation}>
        {groups.map(([title, links]) => <nav className={styles.group} key={title} aria-label={`${groupTitle(title)} — ${text.navigation}`}>
          <h2>{groupTitle(title)}</h2>
          <ul>{links.map(([label, href]) => <li key={href}><Link href={href} aria-current={pathname === href ? 'page' : undefined}>{label}</Link></li>)}</ul>
        </nav>)}
      </div>}
      <div className={styles.bottom}>
        <span className={styles.copyright}>© 2005–2026 Alageum Electric</span>
        <Link href="/data-policy" className={styles.policy} data-no-translate>{text.policy}</Link>
        <div className={styles.socials}>
          <a href="https://www.instagram.com/alageumelectric_/" target="_blank" rel="noopener noreferrer">Instagram<span aria-hidden="true">↗</span></a>
          <a href="https://www.facebook.com/alageum/" target="_blank" rel="noopener noreferrer">Facebook<span aria-hidden="true">↗</span></a>
        </div>
      </div>
    </div>
  </footer>;
}
