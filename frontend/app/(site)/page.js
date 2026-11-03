import CompanyMetrics from '@/components/public/CompanyMetrics';
import { DeliveryPowerChart, VoltageClassChart } from '@/components/public/HomeEngineeringCharts';
import LocaleElement from "@/components/locale/LocaleElement";import { EcoCard } from '@/components/ecosystem/Parts';
import NewsFeed from '@/components/news/NewsFeed';
import PartnerMarquee from '@/components/public/PartnerMarquee';
import CorporateArrow from '@/components/public/CorporateArrow';
import HeroVideo from '@/components/public/HeroVideo';
import Link from "@/components/locale/LocaleLink";
import EquipmentIcon from '@/components/catalog/EquipmentIcon';
import CorporatePage from '@/components/public/CorporatePage';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import { CorporateCTA, ProjectStages, SectionHeading } from '@/components/public/CorporateParts';
import { getCorporatePhoto } from '@/lib/public/photography';

export const metadata = { title: 'ALAGEUM Electric — трансформаторы, подстанции и строительство', description: 'Электротехническая группа Казахстана. Производство трансформаторов и распределительного оборудования, проектирование, строительство и сервис.' };
const categories = [
{ id: 'transformers', title: 'Трансформаторы', text: 'Для преобразования напряжения', icon: 'oil-transformer' },
{ id: 'switchgear', title: 'Распределительные устройства', text: 'Коммутация и распределение энергии', icon: 'switchgear' },
{ id: 'substations', title: 'Подстанции', text: 'Приём и распределение электроэнергии', icon: 'substation' },
{ id: 'cabinets', title: 'Шкафы и щиты', text: 'Управление и электрическая защита', icon: 'control-cabinet' },
{ id: 'protection', title: 'Катодная защита', text: 'Оборудование электрохимической защиты', icon: 'protection-cabinet' }];

export default async function HomePage({ params }) {
  const locale = (await params)?.locale || 'ru';
  return <CorporatePage wide className="corp-home">
    <LocaleElement as="div" className="corp-hero-band"><LocaleElement as="section" className="corp-home-hero site-container">
      <LocaleElement as="div" className="corp-hero-copy"><LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC / КАЗАХСТАН</LocaleElement><LocaleElement as="h1">Трансформаторы<br />и подстанции<br /><LocaleElement as="em">для энергетики.</LocaleElement></LocaleElement><LocaleElement as="p" className="corp-lead">Выпускаем трансформаторы, подстанции и распределительное оборудование. Проектируем и строим энергообъекты, устанавливаем и запускаем оборудование.</LocaleElement><LocaleElement as="div" className="site-actions"><Link className="site-button site-button-primary" href="/company">О компании <CorporateArrow /></Link></LocaleElement><LocaleElement as="a" className="corp-hero-scroll" href="#capabilities"><LocaleElement as="span"><CorporateArrow direction="down" /></LocaleElement> ЧТО МЫ ДЕЛАЕМ</LocaleElement></LocaleElement>
      <HeroVideo />
    </LocaleElement></LocaleElement>
    <LocaleElement as="div" className="corp-facts-band"><LocaleElement as="div" className="site-container corp-fact-strip"><LocaleElement as="div"><LocaleElement as="strong">1997</LocaleElement><LocaleElement as="span">Основание группы<br />Alageum Electric</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="strong">Производство</LocaleElement><LocaleElement as="span">Трансформаторное и<br />распределительное оборудование</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="strong">Работы на объекте</LocaleElement><LocaleElement as="span">Проектирование, строительство,<br />монтаж и сервис</LocaleElement></LocaleElement><Link href="/manufacturers"><LocaleElement as="span">Предприятия<br />и география группы</LocaleElement><CorporateArrow /></Link></LocaleElement></LocaleElement>
    <CompanyMetrics charts />
    <LocaleElement as="section" id="capabilities" className="corp-cycle"><LocaleElement as="div" className="site-container"><SectionHeading number="01" label="ПРОДУКЦИЯ И РАБОТЫ" title="Трансформаторы, подстанции и работы на энергообъектах" href="/company" link="О компании" /><ProjectStages /></LocaleElement></LocaleElement>
    <LocaleElement as="section" className="corp-white-band corp-enterprises-band"><LocaleElement as="div" className="site-container corp-section corp-group-feature"><LocaleElement as="div" className="corp-group-statement"><LocaleElement as="p" className="site-eyebrow">02 / ПРЕДПРИЯТИЯ</LocaleElement><LocaleElement as="h2">Предприятия Alageum<br /><LocaleElement as="span">в Казахстане</LocaleElement></LocaleElement><LocaleElement as="p">Заводы группы выпускают трансформаторы, подстанции и распределительные устройства. Инженерные и строительные предприятия работают на энергообъектах.</LocaleElement><Link href="/manufacturers" className="site-text-link">Заводы на карте <CorporateArrow /></Link></LocaleElement><LocaleElement as="div" className="corp-city-links">{[['Уральск', 'УТЗ'], ['Петропавловск', 'ПЭТЗ'], ['Кентау', 'КТЗ'], ['Шымкент', 'Asia Trafo'], ['Алматы', 'АЭМЗ · Электромонтаж']].map(([city, names]) => <Link href={`/manufacturers?city=${encodeURIComponent(city)}`} key={city}><LocaleElement as="span">{city}<LocaleElement as="small">{names}</LocaleElement></LocaleElement><CorporateArrow /></Link>)}</LocaleElement></LocaleElement></LocaleElement>
    <DeliveryPowerChart />
    <PartnerMarquee />
    <LocaleElement as="section" id="home-news" className="site-container corp-section"><SectionHeading number="03" label="НОВОСТИ КОМПАНИИ" title="Новости Alageum Electric" href="/news" link="Все публикации" /><NewsFeed locale={locale} /></LocaleElement>
    <LocaleElement as="section" id="equipment" className="corp-white-band"><LocaleElement as="div" className="site-container corp-section"><SectionHeading number="04" label="ПРОДУКЦИЯ" title="Оборудование предприятий" href="/catalog" link="Технический каталог" /><LocaleElement as="div" className="corp-equipment-grid">{categories.map((item, index) => <Link className="corp-equipment-card" href={`/catalog?category=${item.id}`} key={item.id}><LocaleElement as="span" className="corp-card-index">0{index + 1}</LocaleElement>{getCorporatePhoto(`category-${item.id}`) ? <CorporatePhoto photo={getCorporatePhoto(`category-${item.id}`)} caption={false} className="corp-equipment-photo" sizes="(max-width: 480px) 100px, 230px" /> : <LocaleElement as="div" className="corp-equipment-symbol"><EquipmentIcon type={item.icon} size={88} /></LocaleElement>}<LocaleElement as="h3">{item.title}</LocaleElement><LocaleElement as="p">{item.text}</LocaleElement><LocaleElement as="span" className="corp-card-arrow"><CorporateArrow /></LocaleElement></Link>)}</LocaleElement><LocaleElement as="p" className="corp-small-note">Параметры, комплектацию и срок поставки выбранного оборудования уточните у производителя.</LocaleElement></LocaleElement></LocaleElement>
    <VoltageClassChart />
    <LocaleElement as="div" className="site-container corp-home-end"><LocaleElement as="div" className="eco-grid home-opportunities"><EcoCard title="О компании" text="Предприятия, история группы и финансовые результаты." href="/company#results" link="О компании" /><EcoCard title="Карьера" text="Вакансии, стажировки и контакты для соискателей." href="/careers" link="Карьера в Alageum" /><EcoCard title="Каталог продукции" text="Найдите оборудование по типу и характеристикам." href="/catalog/home" link="Открыть каталог" /></LocaleElement><CorporateCTA /></LocaleElement>
  </CorporatePage>;
}
