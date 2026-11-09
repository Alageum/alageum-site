import CompanyMetrics from '@/components/public/CompanyMetrics';
import { DeliveryPowerChart } from '@/components/public/HomeEngineeringCharts';
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
import HomeEnterpriseMap from '@/components/public/HomeEnterpriseMap';
import HomeContactForm from '@/components/public/HomeContactForm';
import { corporateProfileHref } from '@/lib/public/content';
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
    <LocaleElement as="div" className="corp-facts-band"><LocaleElement as="div" className="site-container corp-fact-strip"><LocaleElement as="div"><LocaleElement as="strong">1997</LocaleElement><LocaleElement as="span">Основание группы<br />Alageum Electric</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="strong">Производство</LocaleElement><LocaleElement as="span">Трансформаторное и<br />распределительное оборудование</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="strong">Работы на объекте</LocaleElement><LocaleElement as="span">Проектирование, строительство,<br />монтаж и сервис</LocaleElement></LocaleElement><Link href="/manufacturers"><LocaleElement as="span">Предприятия<br />и география группы</LocaleElement><CorporateArrow /></Link></LocaleElement></LocaleElement>
    <CompanyMetrics operationsPhoto={getManufacturerPhoto('ktz')} />
    <LocaleElement as="section" id="capabilities" className="corp-cycle"><LocaleElement as="div" className="site-container"><SectionHeading number="01" label="ПРОДУКЦИЯ И РАБОТЫ" title="От проектирования до ввода в эксплуатацию" href={corporateProfileHref} link="Корпоративный профиль (PDF)" /><LocaleElement as="p" className="corp-lead">Работаем на всех этапах: проектируем энергообъекты, выпускаем оборудование, монтируем и обслуживаем его.</LocaleElement><ProjectStages /></LocaleElement></LocaleElement>
    <DeliveryPowerChart />
    <LocaleElement as="section" id="equipment" className="corp-white-band"><LocaleElement as="div" className="site-container corp-section"><SectionHeading title="Каталог" href="/catalog" link="Технический каталог" /><LocaleElement as="div" className="corp-equipment-grid">{categories.map((item, index) => <Link className="corp-equipment-card" href={`/catalog?category=${item.id}`} key={item.id}><LocaleElement as="span" className="corp-card-index">0{index + 1}</LocaleElement>{getCorporatePhoto(`category-${item.id}`) ? <CorporatePhoto photo={getCorporatePhoto(`category-${item.id}`)} caption={false} className="corp-equipment-photo" sizes="(max-width: 480px) 100px, 230px" /> : <LocaleElement as="div" className="corp-equipment-symbol"><EquipmentIcon type={item.icon} size={88} /></LocaleElement>}<LocaleElement as="h3">{item.title}</LocaleElement><LocaleElement as="p">{item.text}</LocaleElement><LocaleElement as="span" className="corp-card-arrow"><CorporateArrow /></LocaleElement></Link>)}</LocaleElement><LocaleElement as="p" className="corp-small-note">Производитель уточнит характеристики, комплектацию и срок поставки по вашему техническому заданию.</LocaleElement></LocaleElement></LocaleElement>
    <HomeEnterpriseMap />
    <section id="home-industries" className="corp-home-industries">
      <div className="site-container corp-section">
        <SectionHeading number="05" label="ОТРАСЛИ" title="Что мы поставляем для вашей отрасли" href="/industries" link="Все отрасли" />
        <ul className="corp-home-industry-list">
          {industries.map(industry => <li key={industry.id}>
            <span className="corp-home-industry-number" aria-hidden="true">{industry.number}</span>
            <div>
              <h3><Link href={industry.href}>{industry.title}</Link></h3>
              <LocaleElement as="p">{industry.description}</LocaleElement>
            </div>
            <Link className="site-text-link" href={`${industry.href}#industry-projects`}>Проекты и поставки <CorporateArrow /></Link>
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
