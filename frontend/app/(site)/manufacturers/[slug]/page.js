import {PhotoEssay} from '@/components/public/story/Visuals';
import {factoryPhotoEssays} from '@/lib/public/engineering-photography';
import FactoryFact from '@/components/public/story/FactoryFact';
import E from '@/components/locale/LocaleElement';
import { notFound } from 'next/navigation';
import { Story, Hero, Section, Jump, Source, ChapterNav } from '@/components/public/story/Story';
import { manufacturers, manufacturerById } from '@/lib/public/content';
import { enterpriseContacts } from '@/lib/public/company';
import { factoryDossiers } from '@/lib/public/factory-dossiers';
import FactoryFocus from '@/components/public/story/FactoryFocus';
import { getManufacturerPhoto } from '@/lib/public/photography';
const processTitles={
 ktz:'Трансформаторное производство и обучение.',
 'asia-trafo':'Расчёт и подготовка трансформатора к производству.',
 utz:'Как устроен герметичный трансформатор.',
 petz:'Kaizen на производстве.',
 aemz:'Металлообработка и сборка оборудования.',
 elmo:'Проектирование, монтаж и пусконаладка.',
 'batys-electric':'Бетонный корпус и электротехническая часть.',
 'ural-electric':'Корпуса оборудования и эмалированный провод.',
};
export const dynamicParams=false;
export function generateStaticParams(){return manufacturers.map(item=>({slug:item.id}));}
export async function generateMetadata({params}){const item=manufacturerById((await params).slug);return {title:item?.title||'Предприятие',description:item?.description};}
export default async function ManufacturerPage({params}){
 const item=manufacturerById((await params).slug);if(!item)notFound();const dossier=factoryDossiers[item.id],contact=enterpriseContacts[item.id];
 return <Story name={`factory factory-${item.id}`}><Hero ancestors={[{href:'/company',label:'Компания'}]} label={item.short} parent={{href:'/manufacturers',label:'Предприятия и производство'}} title={dossier.theme} lead={dossier.text} photo={getManufacturerPhoto(item.id)} variant={item.id==='asia-trafo'||item.id==='elmo'?'dark':'split'}><E as="p" className="story-kicker" style={{marginTop:24}}>{item.city} · {item.legal}</E></Hero>
 <ChapterNav items={[["#factory-profile","Профиль"],["#factory-process",dossier.focus],["#factory-contact","Контакты"]]}/>
 <Section id="factory-profile" label={item.title} title="Что выпускает завод"><dl className="story-facts">{dossier.facts.map(fact=><div key={fact.label}><E as="dd"><FactoryFact value={fact.value}/></E><E as="dt">{fact.label}</E><E as="small">{fact.period}</E></div>)}</dl><Source href={dossier.source} period="Характеристики из профиля предприятия. Дата обновления не указана. Проверено 01.11.2026."/></Section>
 <Section id="factory-process" label={dossier.focus} title={processTitles[item.id]} tone="paper"><FactoryFocus id={item.id}/>{factoryPhotoEssays[item.id]&&<PhotoEssay photos={factoryPhotoEssays[item.id]}/>}<div className="story-dossier"><div className="story-process">{dossier.chapters.filter((_,index)=>item.id!=='utz'||index!==0).map(([title,text])=><article key={title}><E as="h3">{title}</E><E as="p">{text}</E></article>)}<Jump href={dossier.related[0]}>{dossier.related[1]}</Jump></div><aside><E as="p" className="story-kicker">ПРОДУКЦИЯ</E><E as="h3">{item.short}</E><ul className="story-checklist">{item.capabilities.map(text=><E as="li" key={text}>{text}</E>)}</ul>{item.catalogQuery&&<Jump href={`/catalog?q=${encodeURIComponent(item.catalogQuery)}`}>Оборудование предприятия</Jump>}</aside></div></Section>
 <Section id="factory-contact" label="КОНТАКТЫ" title="Контакты предприятия."><div className="story-columns"><div><E as="p">{contact.label}</E><E as="address" style={{fontStyle:'normal',marginTop:18}}>{contact.city}, {contact.address}</E><Jump href={`tel:${contact.tel}`}>{contact.phone}{contact.extension?` · ${contact.extension}`:''}</Jump><br/><Jump href={`mailto:${contact.email}`}>{contact.email}</Jump></div><div className="story-copy"><E as="p">Напишите, какое оборудование вам нужно. Перед визитом договоритесь о встрече.</E><Jump href={`/inquiry?solution=${encodeURIComponent(item.title)}`}>Подготовить запрос</Jump><Source href="https://alageum.com/ru/kontakty">Официальные контакты</Source></div></div></Section></Story>;
}
