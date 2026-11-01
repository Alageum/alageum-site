import E from '@/components/locale/LocaleElement';
import {Suspense} from 'react';
import {Story,Hero,Section,ChapterNav} from '@/components/public/story/Story';
import CompanyAnchorRestore from '@/components/public/company/CompanyAnchorRestore';
import CompanyProduction from '@/components/public/company/CompanyProduction';
import {companyPageMetadata} from '@/lib/public/company-metadata';
import EnterpriseDirectory from '@/components/public/EnterpriseDirectory';
const pageMetadata={title:'Предприятия и производство',description:'Карта предприятий и офисов продаж Alageum Electric: адреса, контакты и специализации.'};
export async function generateMetadata({params}){return companyPageMetadata(pageMetadata,'/manufacturers',(await params)?.locale||'ru');}
export default function Manufacturers(){return <Story name="geography"><Hero parent={{href:'/company',label:'Компания'}} label="Предприятия и производство" variant="wide" title="Найдите свою точку контакта." lead="Выберите область с филиалами или город. Карта покажет предприятия и офисы продаж; повторное нажатие на выбранную область вернёт общий вид. Представлена подборка точек, подтверждённых доступными источниками."/><ChapterNav items={[["#company-map","Карта предприятий и офисов"],["#technology","Технологии"],["#production-documents","Документация"]]}/><Section id="company-map" label="ГЕОГРАФИЯ ПРИСУТСТВИЯ"><Suspense fallback={<E as="p" role="status">Загружаем географию предприятий…</E>}><EnterpriseDirectory/></Suspense></Section><CompanyProduction/><CompanyAnchorRestore ids={['company-map','technology','production-documents']} waitFor=".corp-geography"/></Story>;}
