import {PhotoEssay} from '@/components/public/story/Visuals';
import {storyPhotos} from '@/lib/public/story-photography';
import FactoryFact from '@/components/public/story/FactoryFact';
import E from '@/components/locale/LocaleElement';
import { notFound } from 'next/navigation';
import { Story, Hero, Section, Jump, Source, ChapterNav } from '@/components/public/story/Story';
import { manufacturers, manufacturerById } from '@/lib/public/content';
import { enterpriseContacts } from '@/lib/public/company';
import { factoryDossiers } from '@/lib/public/factory-dossiers';
import FactoryFocus from '@/components/public/story/FactoryFocus';
import { getManufacturerPhoto } from '@/lib/public/photography';
export const dynamicParams=false;
export function generateStaticParams(){return manufacturers.map(item=>({slug:item.id}));}
export async function generateMetadata({params}){const item=manufacturerById((await params).slug);return {title:item?.title||'Предприятие',description:item?.description};}
export default async function ManufacturerPage({params}){
 const item=manufacturerById((await params).slug);if(!item)notFound();const dossier=factoryDossiers[item.id],contact=enterpriseContacts[item.id];
 return <Story name={`factory factory-${item.id}`}><Hero ancestors={[{href:'/company',label:'Компания'}]} label={item.short} parent={{href:'/manufacturers',label:'Предприятия и производство'}} title={dossier.theme} lead={dossier.text} photo={getManufacturerPhoto(item.id)} variant={item.id==='asia-trafo'||item.id==='elmo'?'dark':'split'}><E as="p" className="story-kicker" style={{marginTop:24}}>{item.city} · {item.legal}</E></Hero>
 <ChapterNav items={[["#factory-profile","Профиль"],["#factory-process",dossier.focus],["#factory-contact","Контакты"]]}/>
 <Section id="factory-profile" label={item.title} title="Параметры специализации."><dl className="story-facts">{dossier.facts.map(fact=><div key={fact.label}><E as="dd"><FactoryFact value={fact.value}/></E><E as="dt">{fact.label}</E><E as="small">{fact.period}</E></div>)}</dl><Source href={dossier.source} period="Проверено 01.11.2026. Недатированные характеристики не являются отчётом о выпуске за год."/></Section>
 <Section id="factory-process" label={dossier.focus} title={item.id==='utz'?'Как устроен герметичный трансформатор.':item.id==='asia-trafo'?'Сначала — модель. Затем — изделие.':item.id==='elmo'?'Работы на площадке.':'Что определяет работу площадки.'} tone="paper"><FactoryFocus id={item.id}/>{item.id==='asia-trafo'&&<PhotoEssay photos={[storyPhotos.asiaEngineering,storyPhotos.asiaLine]} label="Инженерия и производство Asia Trafo"/>}{item.id==='ktz'&&<PhotoEssay photos={[storyPhotos.ktzProcess,storyPhotos.ktzProducts]} label="Производство КТЗ"/>}<div className="story-dossier"><div className="story-process">{dossier.chapters.filter((_,index)=>item.id!=='utz'||index!==0).map(([title,text])=><article key={title}><E as="h3">{title}</E><E as="p">{text}</E></article>)}<Jump href={dossier.related[0]}>{dossier.related[1]}</Jump></div><aside><E as="p" className="story-kicker">НОМЕНКЛАТУРА</E><E as="h3">{item.short}</E><ul className="story-checklist">{item.capabilities.map(text=><E as="li" key={text}>{text}</E>)}</ul>{item.catalogQuery&&<Jump href={`/catalog?q=${encodeURIComponent(item.catalogQuery)}`}>Оборудование предприятия</Jump>}</aside></div></Section>
 <Section id="factory-contact" label="ПРЯМАЯ СВЯЗЬ" title="Обратиться на предприятие."><div className="story-columns"><div><E as="p">{contact.label}</E><E as="address" style={{fontStyle:'normal',marginTop:18}}>{contact.city}, {contact.address}</E><Jump href={`tel:${contact.tel}`}>{contact.phone}{contact.extension?` · ${contact.extension}`:''}</Jump><br/><Jump href={`mailto:${contact.email}`}>{contact.email}</Jump></div><div className="story-copy"><E as="p">Укажите предприятие, тип оборудования и назначение объекта. Перед визитом уточните расположение отдела продаж и порядок посещения.</E><Jump href={`/inquiry?solution=${encodeURIComponent(item.title)}`}>Составить технический запрос</Jump><Source href="https://alageum.com/ru/kontakty">Официальные контакты</Source></div></div></Section></Story>;
}
