import GroupResults from './company/GroupResults';
import GroupStructure from './company/GroupStructure';
import {Story,Hero,Section,Jump,ChapterNav,ReadingLinks} from './story/Story';
import CompanyHistory from './company/CompanyHistory';
export const metadata={title:'О компании — структура, история и признание',description:'Предприятия Alageum Electric, финансовые результаты, история группы и награды.'};
const groupPhoto={path:'/company/aemz-engineers.webp',width:951,height:367,alt:'Специалисты Алматинского электромеханического завода у электротехнического оборудования',caption:'АЭМЗ · специалисты у оборудования',objectPosition:'68% 50%'};
// CMS owns the overview slot when selected; historical chapters remain the
// existing sourced editorial content. API errors never select static overview.
export default function CompanyPage({overview}){return <Story name="company company-overview">

 {overview?<div id="structure" className="company-cms-overview"><span id="responsibility"/>{overview}</div>:<Hero label="О компании" title="Alageum Electric" lead="Alageum Electric объединяет трансформаторные и электротехнические заводы, проектные и строительные предприятия. Группа работает с 1997 года." photo={groupPhoto}><Jump href="#structure">Предприятия группы</Jump></Hero>}
 <div className="company-chapters"><ChapterNav items={[["#structure","Структура"],["#results","Результаты работы"],["#history","История"],["#achievements","Награды"],["#company-guide","Документы и контакты"]]}/></div>
 {!overview&&<GroupStructure/>}
 <GroupResults/>
 <CompanyHistory/>
 <Section id="company-guide" label="ДОКУМЕНТЫ И КОНТАКТЫ" title="Документы и контакты"><ReadingLinks items={[["/documents","Документы","Корпоративный каталог, технические материалы и список поставок."],["/contacts#investment","Инвесторам и партнёрам","Контакт для запроса отчётности и обсуждения сотрудничества."],["/careers","Карьера","Вакансии, стажировки и подготовка отклика."],["/contacts#assets","Непрофильные активы","Объявление об объекте и контакт для уточнения условий."]]} /></Section>
 </Story>;}
