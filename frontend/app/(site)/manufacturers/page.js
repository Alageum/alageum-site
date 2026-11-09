import E from '@/components/locale/LocaleElement';
import {Suspense} from 'react';
import {Story,Hero,Section,ChapterNav,Jump,ReadingLinks} from '@/components/public/story/Story';
import CompanyAnchorRestore from '@/components/public/company/CompanyAnchorRestore';
import CompanyProduction from '@/components/public/company/CompanyProduction';
import {companyPageMetadata} from '@/lib/public/company-metadata';
import {engineeringOrganizations} from '@/lib/public/engineering-organizations';
import EnterpriseDirectory from '@/components/public/EnterpriseDirectory';
const pageMetadata={title:'Предприятия и производство',description:'Карта предприятий и офисов продаж Alageum Electric: адреса, контакты и специализации.'};
export async function generateMetadata({params}){return companyPageMetadata(pageMetadata,'/manufacturers',(await params)?.locale||'ru');}
export default function Manufacturers(){return <Story name="geography"><Hero label="Предприятия и производство" kicker={null} variant="wide" title="Заводы и проектные организации" lead="Выберите город или область на карте — появятся предприятия, адреса и телефоны."><Jump href="#company-map">Карта предприятий и офисов</Jump></Hero><ChapterNav items={[["#company-map","Карта предприятий и офисов"],["#engineering-organizations","Проектные организации"],["#technology","Технологии"],["#production-documents","Документация"]]}/><Section id="company-map" label="ПРЕДПРИЯТИЯ НА КАРТЕ"><Suspense fallback={<E as="p" role="status">Загружаем карту…</E>}><EnterpriseDirectory/></Suspense></Section><Section id="engineering-organizations" title="Проектные организации"><E as="p" className="story-lead">Институты, представленные в корпоративном каталоге Alageum среди проектных партнёров. Их специализация и статус указаны в профилях.</E><ReadingLinks items={engineeringOrganizations.map(item=>[item.href,item.short,item.description])}/></Section><CompanyProduction/><CompanyAnchorRestore ids={['company-map','technology','production-documents']} waitFor=".corp-geography"/></Story>;}
