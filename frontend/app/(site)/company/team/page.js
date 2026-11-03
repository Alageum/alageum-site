import {companyPageMetadata} from '@/lib/public/company-metadata';
import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import {Story,Hero,Section,Jump,Source} from '@/components/public/story/Story';
import {leaders} from '@/lib/ecosystem/leadership';
const pageMetadata={title:'Команда и руководство Alageum Electric'};
export async function generateMetadata({params}){return companyPageMetadata(pageMetadata,'/company/team',(await params)?.locale||'ru');}
export default function Team(){const founder=leaders[0];return <Story name="team"><Hero label="Руководство" parent={{href:'/company',label:'Компания'}} variant="split" photo={{path:founder.photo,width:480,height:560,alt:founder.name,caption:founder.role}} title="Руководство Alageum Electric" lead="Основатель, руководители группы и предприятий."><E as="h2" className="team-founder-name">{founder.name}</E><E as="p">{founder.role}</E><Jump href={founder.source}>Биография</Jump></Hero><Section tone="paper" label="РУКОВОДИТЕЛИ" title="Руководители группы и предприятий"><div className="story-leaders">{leaders.slice(1).map(person=><article key={person.source}><Image src={person.photo} alt={person.name} width={300} height={360}/><div><E as="h3">{person.name}</E><E as="p">{person.role}</E><Jump href={person.source}>Биография</Jump></div></article>)}</div><Source href="https://alageum.com/ru/kompaniya/rukovodstvo" period="Сведения о руководителях сверены 01.11.2026."/></Section></Story>;}
