import E from '@/components/locale/LocaleElement';
import ProjectValue from '@/components/public/story/ProjectValue';
import {notFound} from 'next/navigation';
import {Story,Hero,Section,Jump,Source} from '@/components/public/story/Story';
import {projectTypeLabel} from '@/lib/public/project-cases';
import {projects,projectById} from '@/lib/public/content';
import {getProjectPhoto} from '@/lib/public/photography';
export const dynamicParams=false;
export function generateStaticParams(){return projects.map(item=>({slug:item.id}));}
export async function generateMetadata({params}){const item=projectById((await params).slug);return {title:item?.title||'Проект',description:item?.description};}
export default async function Project({params}){const item=projectById((await params).slug);if(!item)notFound();const photo=getProjectPhoto(item.id);const supply=item.kind==='supply';return <Story name={`case case-${item.kind}`}><Hero label={projectTypeLabel(item.kind)} parent={{href:'/projects',label:'Проекты'}} variant={photo?'dark':supply?'wide':'dark'} photo={photo} title={item.title} lead={item.location}><E as="p" className="story-kicker" style={{marginTop:30}}>{item.period} · {item.role}</E></Hero>
 <Section label={supply?'ПРЕДМЕТ ПОСТАВКИ':'ОБЪЕКТ И РАБОТЫ'}><div className="story-columns"><div><E as="h2"><ProjectValue value={item.metric}/></E><E as="p" style={{marginTop:20}}>{item.metricLabel}</E><E as="p" className="story-source">{item.context}</E></div><div className="story-copy"><E as="h3">{supply?'Оборудование для объекта':'Задача проекта'}</E><E as="p" style={{marginTop:25}}>{item.description}</E><E as="p">{item.contribution}</E></div></div></Section>

 {item.facts?.some(f=>f.value!==item.metric)&&<Section label="ДЕТАЛИ ПОСТАВКИ"><dl className="story-facts">{item.facts.filter(f=>f.value!==item.metric).map(f=><div key={f.label}><E as="dd">{f.value}</E><E as="dt">{f.label}</E></div>)}</dl></Section>}
 <Section label="ДОКУМЕНТЫ ПРОЕКТА" title={supply?'Сведения о поставке':'Работы и документация'}><div className="story-columns"><div><E as="h3">{item.voltage}</E><E as="p" style={{marginTop:20}}>{item.label}</E></div><div className="story-copy"><E as="p">{item.note}</E><Source href={item.source} period={item.period}>{item.sourceLabel}</Source><Jump href="/projects">Все проекты</Jump></div></div></Section></Story>;}
