import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import Link from "@/components/locale/LocaleLink";
import { projectStages } from '@/lib/public/company';

export function SectionHeading({ number, label, title, href, link }) {
  return <LocaleElement as="div" className="corp-section-heading"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">{number} / {label}</LocaleElement><LocaleElement as="h2">{title}</LocaleElement></LocaleElement>{href && <Link className="site-text-link" href={href}>{link} <CorporateArrow /></Link>}</LocaleElement>;
}
export function ProjectStages() {
  return <LocaleElement as="ol" className="corp-stages">{projectStages.map((stage) => <LocaleElement as="li" key={stage.number}><LocaleElement as="span" className="corp-stage-number">{stage.number}</LocaleElement><LocaleElement as="h3">{stage.title}</LocaleElement><LocaleElement as="p">{stage.text}</LocaleElement><Link href={stage.href} aria-label={`${stage.title}: подробнее`} className="corp-stage-link"><CorporateArrow /></Link></LocaleElement>)}</LocaleElement>;
}
export function CorporateCTA({ title = <>Обсудим ваш проект<br />и возможности группы.</>, text = 'Для первого разговора расскажите о задаче, площадке и необходимом оборудовании. Контакты предприятий и региональных отделов помогут выбрать нужное направление.' }) {
  return <LocaleElement as="section" className="corp-cta"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">СОТРУДНИЧЕСТВО</LocaleElement><LocaleElement as="h2">{title}</LocaleElement><LocaleElement as="p">{text}</LocaleElement></LocaleElement><LocaleElement as="div" className="corp-cta-actions"><Link className="site-button site-button-primary" href="/contacts">Связаться с нами <CorporateArrow /></Link><Link className="site-text-link" href="/documents">Материалы о группе <CorporateArrow direction="right" /></Link></LocaleElement></LocaleElement>;
}
