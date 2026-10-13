import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import Link from "@/components/locale/LocaleLink";
export default function ProjectCTA({ title = 'Обсудим ваш проект', text = 'Опишите задачу и соберите требования к оборудованию. Готовый запрос можно проверить и самостоятельно передать менеджеру.', href = '/inquiry', label = 'Подготовить запрос' }) {
  return <LocaleElement as="section" className="site-page-cta"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">СЛЕДУЮЩИЙ ШАГ</LocaleElement><LocaleElement as="h2">{title}</LocaleElement><LocaleElement as="p">{text}</LocaleElement></LocaleElement><Link className="site-button site-button-primary" href={href}>{label}<CorporateArrow /></Link></LocaleElement>;
}
