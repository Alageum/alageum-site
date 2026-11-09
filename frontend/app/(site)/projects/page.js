import {getProjectPhoto} from '@/lib/public/photography';
import E from '@/components/locale/LocaleElement';
import {Story,Hero,Section,Jump,ChapterNav} from '@/components/public/story/Story';
import ProjectPortfolio from '@/components/public/ProjectPortfolio';
export const metadata={title:'Проекты Alageum Electric',description:'Строительство подстанций, реконструкция электросетей и поставки оборудования предприятий Alageum Electric.'};
export default function Projects(){return <Story name="projects">
 <Hero label="Проекты" variant="dark" photo={getProjectPhoto('nura')} title="Наши проекты и поставки" lead="Подстанции, электростанции и городские сети, для которых предприятия Alageum поставляли оборудование или выполняли строительные работы."><Jump href="#portfolio">Найти проект</Jump></Hero>
 <ChapterNav items={[["#portfolio","Найти проект"],["#project-evidence","Каталоги и референсы"]]}/>
 <Section id="portfolio"><ProjectPortfolio/></Section>
 <Section id="project-evidence" tone="paper" label="ДОКУМЕНТЫ" title="Документы о проектах и поставках">
  <div className="story-columns"><E as="p" className="story-lead">В референс-листах указаны объекты, заказчики и поставленное оборудование. Корпоративный каталог содержит перечень строительных проектов группы.</E><div><Jump href="/documents">Каталоги и документы</Jump></div></div>
 </Section>
 </Story>;}
