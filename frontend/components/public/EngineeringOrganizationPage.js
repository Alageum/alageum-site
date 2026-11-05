import E from '@/components/locale/LocaleElement';
import {Story,Hero,Section,Jump,Source,ChapterNav} from './story/Story';
import {engineeringOrganizationById} from '@/lib/public/engineering-organizations';

export default function EngineeringOrganizationPage({id}) {
  const item = engineeringOrganizationById(id);
  return <Story name="engineering-organization"><Hero label={item.short} title={item.title} lead={item.lead} variant="wide" parent={{href:'/manufacturers',label:'Предприятия'}}/>
    <ChapterNav items={[["#engineering-work","Работы"],["#engineering-experience","Опыт и сотрудничество"],["#engineering-contact","Обращение"]]}/>
    <Section id="engineering-work" label={item.role} title="Что делает институт"><ul className="story-checklist">{item.capabilities.map(text=><E as="li" key={text}>{text}</E>)}</ul><E as="p" className="story-note">{item.history}</E><Source href={item.source}>{item.sourceLabel}</Source>{item.website&&<Source href={item.website}>Сайт института «Энергия» · подразделения и направления работ</Source>}</Section>
    <Section id="engineering-experience" title="Опыт и сотрудничество" tone="paper"><E as="p" className="story-lead">{item.evidence}</E><Jump href={item.evidenceHref}>Открыть материал</Jump><div className="story-reading-links"><Jump href="/industries/epc">Инжиниринг и EPC-проекты</Jump><Jump href="/projects">Проекты Alageum</Jump></div></Section>
    <Section id="engineering-contact" title="Обсудить проект"><div className="story-columns"><div><E as="p">Укажите объект, напряжение, состав проектных работ и сроки. Отдел продаж Alageum поможет направить обращение.</E><Jump href="/contacts">Контакты Alageum</Jump></div><div><E as="p" className="story-note">{item.legalNote}</E><Source href={item.identitySource}>Наименование организации в открытом реестре</Source></div></div></Section>
  </Story>;
}
