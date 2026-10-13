import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import Link from "@/components/locale/LocaleLink";
import PageIntro from '@/components/public/PageIntro';
import CorporatePage from '@/components/public/CorporatePage';
import CorporatePhoto from '@/components/public/CorporatePhoto';
import ProjectCTA from '@/components/public/ProjectCTA';
import ProjectPortfolio from '@/components/public/ProjectPortfolio';
import { projectById, projects } from '@/lib/public/content';
import { getProjectPhoto } from '@/lib/public/photography';
import { projectPortfolioSource } from '@/lib/public/project-cases';
export const metadata = { title: 'Проекты и кейсы', description: 'Строительство, реконструкция и поставки оборудования ALAGEUM Electric. Реальные кейсы предприятий группы с параметрами и официальными источниками.' };
export default function ProjectsPage() {
  const featured = projectById('nura');
  return <CorporatePage className="corp-projects"><PageIntro label="Проекты" title={<>Энергия<br /><LocaleElement as="span" className="corp-heading-muted">реальных проектов.</LocaleElement></>} description="Высоковольтные подстанции, городские сети, промышленность и возобновляемая энергетика. Посмотрите, какие задачи решали предприятия группы и в чём состояло их участие." />
    <LocaleElement as="div" className="project-portfolio-facts"><LocaleElement as="div"><LocaleElement as="strong">100+</LocaleElement><LocaleElement as="span">Крупных проектов в истории группы¹</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="strong">{projects.length}</LocaleElement><LocaleElement as="span">Кейсов в этой подборке</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="strong">3</LocaleElement><LocaleElement as="span">Направления: строительство, реконструкция, поставка</LocaleElement></LocaleElement></LocaleElement>
    <LocaleElement as="p" className="project-source-caption">¹ По <LocaleElement as="a" href={`${projectPortfolioSource}#page=5`} target="_blank" rel="noopener noreferrer">корпоративному каталогу 2024 года</LocaleElement>. Подборка показывает часть портфеля группы.</LocaleElement>
    <Link href="/projects/nura" className="project-featured"><CorporatePhoto photo={getProjectPhoto(featured.id)} caption={false} priority sizes="(max-width: 760px) 100vw, 90vw" /><LocaleElement as="div" className="project-featured-copy"><LocaleElement as="p" className="site-eyebrow">В ФОКУСЕ / ASIA TRAFO</LocaleElement><LocaleElement as="h2">{featured.title}</LocaleElement><LocaleElement as="p">Оборудование для высоковольтной энергосистемы.</LocaleElement><LocaleElement as="div" className="project-featured-facts"><LocaleElement as="span"><LocaleElement as="strong">500 кВ</LocaleElement>Класс напряжения</LocaleElement><LocaleElement as="span"><LocaleElement as="strong">{featured.metric}</LocaleElement>Автотрансформаторы</LocaleElement></LocaleElement><LocaleElement as="span" className="site-text-link">Посмотреть кейс <CorporateArrow /></LocaleElement></LocaleElement><LocaleElement as="span" className="project-featured-caption">{getProjectPhoto(featured.id).caption}</LocaleElement></Link>
    <ProjectPortfolio />
    <ProjectCTA title="Какая задача стоит перед вами?" text="Расскажите об объекте, мощности и этапе проекта. Подберём направление для обсуждения оборудования и работ." />
  </CorporatePage>;
}
