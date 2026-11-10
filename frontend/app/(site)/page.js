import CompanyMetrics from '@/components/public/CompanyMetrics';
import LocaleElement from "@/components/locale/LocaleElement";
import NewsFeed from '@/components/news/NewsFeed';
import PartnerMarquee from '@/components/public/PartnerMarquee';
import CorporateArrow from '@/components/public/CorporateArrow';
import HeroVideo from '@/components/public/HeroVideo';
import Link from "@/components/locale/LocaleLink";
import EquipmentIcon from '@/components/catalog/EquipmentIcon';
import CorporatePage from '@/components/public/CorporatePage';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import { ProjectStages, SectionHeading } from '@/components/public/CorporateParts';
import HomeContactForm from '@/components/public/HomeContactForm';
import { corporateProfileHref, manufacturerById } from '@/lib/public/content';
import { industries } from '@/lib/public/industries';
import { getCorporatePhoto, getManufacturerPhoto } from '@/lib/public/photography';
import '@/components/public/corporate-home.css';

export const metadata = { title: 'ALAGEUM Electric — трансформаторы, подстанции и строительство', description: 'Электротехническая группа Казахстана. Производство трансформаторов и распределительного оборудования, проектирование, строительство и сервис.' };
const categories = [
{ id: 'transformers', title: 'Трансформаторы', text: 'Преобразование напряжения в электрических сетях', icon: 'oil-transformer' },
{ id: 'switchgear', title: 'Распределительные устройства', text: 'Переключение и распределение электроэнергии', icon: 'switchgear' },
{ id: 'substations', title: 'Подстанции', text: 'Приём и распределение электроэнергии', icon: 'substation' },
{ id: 'cabinets', title: 'Шкафы и щиты', text: 'Управление оборудованием и защита цепей', icon: 'control-cabinet' },
{ id: 'protection', title: 'Катодная защита', text: 'Защита металлических конструкций от коррозии', icon: 'protection-cabinet' }];
const keyEnterprises = ['ktz', 'elmo', 'asia-trafo', 'aemz', 'utz', 'petz', 'batys-electric'].map(manufacturerById);
const industryIcons = {
  'power-grid': 'M5 21 10 3h4l5 18M7 15h10M4 10h16M9 10l8 5m-2-5-8 5M4 21h16',
  'oil-gas': 'M12 3c-3 4-6 7-6 11a6 6 0 0 0 12 0c0-4-3-7-6-11ZM9 15a3 3 0 0 0 3 3',
  'industry-mining': 'M3 21V11l6 3V9l6 3V5h5l1 16H3Zm4-4v1m4-1v1m4-1v1',
  'civil-construction': 'M3 21h18M5 21V4h9v17m0-12h5v12M8 8h3m-3 4h3m-3 4h3m5-3h1m-1 3h1',
  'infrastructure-transport': 'M7 4h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm-2 9h14m-7-9v9m-4 2.5h.01m8 0h.01M8 18l-2 3m10-3 2 3',
  epc: 'M5 3h10l4 4v14H5V3Zm10 0v5h4M8 12h8m-8 4h5',
  renewables: 'M12 9V3c3 0 5 2 5 4l-5 2Zm0 0-5 3c-1.5-2.6-.8-5.2 1-6l4 3Zm0 0 5 3c-1.5 2.6-4.2 3-6 2l1-5Zm0 5v7m-4 0h8',
};

export default async function HomePage({ params }) {
  const locale = (await params)?.locale || 'ru';
  return <CorporatePage wide className="corp-home">
    <LocaleElement as="div" className="corp-hero-band"><LocaleElement as="section" className="corp-home-hero site-container">
      <LocaleElement as="div" className="corp-hero-copy">
        <LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC / КАЗАХСТАН</LocaleElement>
        <LocaleElement as="h1">Энергетическая безопасность начинается с отечественного производства</LocaleElement>
        <LocaleElement as="p" className="corp-lead">Миссия: обеспечить потребителей по всему миру инновационными и эффективными решениями в отрасли электромашиностроения.</LocaleElement>
        <LocaleElement as="div" className="site-actions">
          <Link className="site-button site-button-primary" href="/catalog">Каталог продукции <CorporateArrow /></Link>
          <Link className="site-button corp-home-company-link" href="/company">О компании <CorporateArrow /></Link>
        </LocaleElement>
        <LocaleElement as="a" className="corp-hero-scroll" href="#capabilities">
          <LocaleElement as="span"><CorporateArrow direction="down" /></LocaleElement> НАШИ ВОЗМОЖНОСТИ
        </LocaleElement>
      </LocaleElement>
      <HeroVideo />
    </LocaleElement></LocaleElement>
    <LocaleElement as="section" id="equipment" className="corp-white-band"><LocaleElement as="div" className="site-container corp-section"><SectionHeading title="Каталог" href="/catalog" link="Технический каталог" /><LocaleElement as="div" className="corp-equipment-grid">{categories.map((item, index) => <Link className="corp-equipment-card" href={`/catalog?category=${item.id}`} key={item.id}><LocaleElement as="span" className="corp-card-index">0{index + 1}</LocaleElement>{getCorporatePhoto(`category-${item.id}`) ? <CorporatePhoto photo={getCorporatePhoto(`category-${item.id}`)} caption={false} className="corp-equipment-photo" sizes="(max-width: 480px) 100px, 230px" /> : <LocaleElement as="div" className="corp-equipment-symbol"><EquipmentIcon type={item.icon} size={88} /></LocaleElement>}<LocaleElement as="h3">{item.title}</LocaleElement><LocaleElement as="p">{item.text}</LocaleElement><LocaleElement as="span" className="corp-card-arrow"><CorporateArrow /></LocaleElement></Link>)}</LocaleElement><LocaleElement as="p" className="corp-small-note">Производитель уточнит характеристики, комплектацию и срок поставки по вашему техническому заданию.</LocaleElement></LocaleElement></LocaleElement>
    <LocaleElement as="section" id="capabilities" aria-label="Направления деятельности">
      <div className="corp-cycle"><LocaleElement as="div" className="site-container"><SectionHeading number="02" label="ПРОДУКЦИЯ И РАБОТЫ" title="Направления деятельности" href={corporateProfileHref} link="Корпоративный профиль (PDF)" /><LocaleElement as="p" className="corp-lead">Работаем на всех этапах: проектируем энергообъекты, выпускаем оборудование, монтируем и обслуживаем его.</LocaleElement><ProjectStages /></LocaleElement></div>
    </LocaleElement>
    <CompanyMetrics operationsPhoto={getManufacturerPhoto('ktz')} />
    <section id="home-enterprises" className="corp-home-enterprises">
      <div className="site-container corp-section">
        <SectionHeading number="04" label="ПРЕДПРИЯТИЯ" title="Ключевые предприятия" href="/manufacturers#company-map" link="Все предприятия и офисы" />
        <ul className="corp-home-enterprise-list">
          {keyEnterprises.map(({ id, legal }) => <li key={id}>
            <Link href={`/manufacturers/${id}`}>{id === 'batys-electric' ? 'ТОО «Batys Electric»' : legal} <CorporateArrow /></Link>
          </li>)}
        </ul>
      </div>
    </section>
    <section id="home-industries" className="corp-home-industries">
      <div className="site-container corp-section">
        <SectionHeading number="05" label="ОТРАСЛИ" title="Что мы поставляем для вашей отрасли" href="/industries" link="Все отрасли" />
        <ul className="corp-home-industry-list">
          {industries.map(industry => <li key={industry.id}>
            <svg className="corp-home-industry-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={industryIcons[industry.id]} />
            </svg>
            <div>
              <h3><Link href={industry.href}>{industry.title}</Link></h3>
              <LocaleElement as="p">{industry.description}</LocaleElement>
            </div>
          </li>)}
        </ul>
      </div>
    </section>
    <PartnerMarquee number="06" />
    <section id="home-news" className="site-container corp-section">
      <SectionHeading number="07" label="НОВОСТИ КОМПАНИИ" title="Новости компании и её предприятий" href="/news" link="Все публикации" />
      <NewsFeed locale={locale} />
    </section>
    <HomeContactForm />
  </CorporatePage>;
}
