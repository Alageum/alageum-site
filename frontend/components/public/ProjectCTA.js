import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import Link from "@/components/locale/LocaleLink";
export default function ProjectCTA({ title = 'Нужно заказать оборудование?', text = 'Укажите название, количество, параметры и сроки. Сайт поможет составить письмо — отправите его сами.', href = '/inquiry', label = 'Подготовить запрос' }) {
  return <LocaleElement as="section" className="site-page-cta"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">ЗАКАЗ ОБОРУДОВАНИЯ</LocaleElement><LocaleElement as="h2">{title}</LocaleElement><LocaleElement as="p">{text}</LocaleElement></LocaleElement><Link className="site-button site-button-primary" href={href}>{label}<CorporateArrow /></Link></LocaleElement>;
}
