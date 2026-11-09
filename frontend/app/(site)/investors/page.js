import E from '@/components/locale/LocaleElement';
import {Story,Hero,Section,Jump,Source,ChapterNav} from '@/components/public/story/Story';
import {VisualStat} from '@/components/public/story/Visuals';
import {companyMetricsSource,companyMetricFacts} from '@/lib/public/company-metrics';
import {companyPageMetadata} from '@/lib/public/company-metadata';
const financials=companyMetricFacts.filter(fact=>['Выручка','Чистая прибыль'].includes(fact.label));
const ranking=companyMetricFacts.find(fact=>fact.label==='Место в рейтинге Forbes');
const metadata={title:'Инвесторам',description:'Финансовые показатели Alageum Electric по Forbes Kazakhstan, документы о группе и контакт для инвестиционных обращений.'};
export async function generateMetadata({params}){return companyPageMetadata(metadata,'/investors',(await params)?.locale||'ru');}
export default function InvestorsPage(){return <Story name="investors"><Hero label="Инвесторам" kicker={null} title="Alageum Electric: показатели и сотрудничество" lead="Финансовые показатели группы, сведения о предприятиях и контакты по вопросам инвестиций." variant="wide"><div className="investor-rank"><VisualStat value={ranking.value} label={ranking.label} period={ranking.note}/><Source href={companyMetricsSource.href}>Forbes Kazakhstan · профиль ГК Alageum Electric · декабрь 2025</Source></div></Hero>
  <ChapterNav items={[["#investor-results","Финансовые показатели"],["#investor-documents","Документы"],["#investor-contact","Обращение"]]}/>
  <Section id="investor-results" title="Результаты за 2024 год"><div className="story-facts">{financials.map(fact=><VisualStat key={fact.label} value={fact.value} decimals={fact.decimals} unit={fact.unit} label={fact.label}/>)}</div><Source href={companyMetricsSource.href} /><E as="p" className="story-note">Выручка и чистая прибыль относятся к 2024 году. Публикация Forbes не заменяет аудированную финансовую отчётность.</E></Section>
  <Section id="investor-documents" title="Материалы о группе" tone="paper"><div className="story-reading-links"><Jump href="/documents/alageum-group-2024.pdf">Корпоративный каталог · 2024 · PDF</Jump><Jump href="/manufacturers">Предприятия и производственные возможности</Jump><Jump href="/company#results">О компании и результаты работы</Jump></div><E as="p" className="story-note">Аудированная финансовая отчётность на сайте не опубликована. Возможность предоставления отчётности и других документов уточняйте в компании.</E></Section>
  <Section id="investor-contact" title="Обсудить сотрудничество"><div className="story-columns"><E as="p" className="story-lead">Укажите название вашей компании, цель обращения, интересующий отчётный период и контактные данные для ответа.</E><div><Jump href="/contacts#investment">Контакт для инвестиционных обращений</Jump><Jump href="mailto:sales@alageum.com?subject=Инвестиционный%20запрос">sales@alageum.com</Jump></div></div></Section>
</Story>;}
