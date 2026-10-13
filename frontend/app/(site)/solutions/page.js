import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import CorporatePage from '@/components/public/CorporatePage';
import Link from "@/components/locale/LocaleLink";
import PageIntro from '@/components/public/PageIntro';
import ProjectCTA from '@/components/public/ProjectCTA';
import { solutions } from '@/lib/public/solutions';
import ProductionFeature from '@/components/public/ProductionFeature';
export const metadata = { title: 'Решения', description: 'Подготовка технического запроса для распределительных сетей, промышленности и городской инфраструктуры.' };
export default function SolutionsPage() {
  return <CorporatePage><PageIntro label="Решения" title={<>Направления работы.<br />Отраслевые задачи.</>} description="Электроснабжение распределительных сетей, промышленных площадок и городской инфраструктуры. Узнайте, какое оборудование относится к вашей задаче и с чего начать обсуждение проекта." /><ProductionFeature title={<>Инженерная задача.<br />Промышленный масштаб.</>} text="Производственные компетенции предприятий группы — основа для обсуждения оборудования под требования вашего объекта." /><LocaleElement as="section" className="site-solution-list" aria-label="Направления решений">{solutions.map((item) => <LocaleElement as="article" className="site-solution-row" key={item.id}><LocaleElement as="span" className="site-eyebrow">{item.number}</LocaleElement><LocaleElement as="h2">{item.title}</LocaleElement><LocaleElement as="div"><LocaleElement as="p">{item.description}</LocaleElement><Link className="site-text-link" href={`/solutions/${item.id}`}>Посмотреть направление <CorporateArrow /></Link></LocaleElement></LocaleElement>)}</LocaleElement><LocaleElement as="div" className="public-note"><LocaleElement as="strong">Предварительный подбор</LocaleElement><LocaleElement as="p">Эти маршруты помогают подготовить техническое задание. Конкретное исполнение, совместимость и комплектность определяются проектом и подтверждаются производителем.</LocaleElement></LocaleElement><ProjectCTA /></CorporatePage>;
}
