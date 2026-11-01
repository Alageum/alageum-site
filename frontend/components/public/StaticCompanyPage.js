import GroupResults from './company/GroupResults';
import GroupStructure from './company/GroupStructure';
import {Story,Hero,Section,Jump,ChapterNav,ReadingLinks} from './story/Story';
import CompanyHistory from './company/CompanyHistory';
export const metadata={title:'О компании — структура, история и признание',description:'Как устроена Alageum Electric, как развивалась группа и какие исторические награды получили её предприятия.'};
const groupPhoto={path:'/company/aemz-engineers.webp',width:951,height:367,alt:'Специалисты Алматинского электромеханического завода у электротехнического оборудования',caption:'АЭМЗ · специалисты у оборудования',objectPosition:'68% 50%'};
// CMS owns the overview slot when selected; historical chapters remain the
// existing sourced editorial content. API errors never select static overview.
export default function CompanyPage({overview}){return <Story name="company company-overview">

 {overview?<div id="structure" className="company-cms-overview"><span id="responsibility"/>{overview}</div>:<Hero label="О компании" title="Alageum Electric" lead="Alageum Electric связывает производство оборудования с проектированием и работами на энергообъектах. У каждого предприятия — собственная специализация и ответственность." photo={groupPhoto}><Jump href="#structure">Как устроена группа</Jump></Hero>}
 <div className="company-chapters"><ChapterNav items={[["#structure","Структура"],["#results","Масштаб бизнеса"],["#history","История"],["#achievements","Награды"],["#company-guide","Материалы и обращения"]]}/></div>
 {!overview&&<GroupStructure/>}
 <GroupResults/>
 <CompanyHistory/>
 <Section id="company-guide" label="МАТЕРИАЛЫ И ОБРАЩЕНИЯ" title="Документы и обращения."><ReadingLinks items={[["/documents","Документы","Каталоги, корпоративный обзор и референсы поставок."],["/contacts#investment","Инвестиционное сотрудничество","Запрос финансовой отчётности и обращение в компанию."],["/careers","Карьера","Работа, стажировки и обращение к HR."],["/contacts#assets","Непрофильные активы","Архивное объявление и порядок уточнения условий."]]} /></Section>
 </Story>;}
