import E from '@/components/locale/LocaleElement';
import {Section,Source,Jump} from '../story/Story';
import CorporatePhoto from '../CorporatePhoto';
import {companyHistory} from '@/lib/public/company';
import {storyPhotos} from '@/lib/public/story-photography';
const awardsSource='https://alageum.com/ru/kompaniya/dostizheniya';
export default function CompanyHistory(){return <>
 <Section id="history" label="ИСТОРИЯ ГРУППЫ" title="Как складывалась общая история.">
  <CorporatePhoto photo={storyPhotos.history} className="company-archive-photo" sizes="90vw"/>
  <ol className="company-milestones">{companyHistory.map(item=><li key={item.year}><time>{item.year}</time><E as="h3">{item.title}</E><E as="p">{item.text}</E><Source href={item.source} period={`Событие: ${item.year}`}/></li>)}</ol>
  <div className="company-history-context"><E as="p">Алматинский электромеханический завод ведёт историю с 1959 года. Дата создания площадки и дата её присоединения к группе — разные события.</E><Jump href="/manufacturers/aemz">История и специализация АЭМЗ</Jump><Source href="https://alageum.com/ru/predpriyatiya/too-aemz"/></div>
 </Section>
 <Section id="achievements" tone="paper" label="ПРИЗНАНИЕ" title="Награды — с именами получателей и датами.">
  <div className="company-awards-opening"><CorporatePhoto photo={storyPhotos.recognition} className="recognition-panorama" sizes="(max-width:760px) 100vw,50vw"/><div><E as="p">Исторические награды Кентауского трансформаторного завода. Награда предприятия не заменяет документы на конкретное изделие.</E><Source href={awardsSource} period="Исторический перечень наград · Кентауский трансформаторный завод"/></div></div>
  <div className="company-awards">{[['2012','«Алтын сапа»','25 декабря. КТЗ получил премию в категории крупных предприятий производственного назначения.'],['2016','«Ұлы дала елі»','6 декабря. КТЗ получил право использовать зонтичный бренд.'],['2016','«Парыз»','КТЗ отмечен в конкурсе социальной ответственности бизнеса.']].map(([year,title,text])=><article key={title}><span className="company-award-year">{year}</span><E as="h3">{title}</E><E as="p">{text}</E></article>)}</div>
  <div className="company-personal-award"><E as="h3">«Парасат» · 2013</E><E as="p">В декабре 2013 года Сайдулла Кожабаев награждён орденом «Парасат» за вклад в социально-экономическое развитие страны.</E><Source href={awardsSource}/><Jump href="/documents">Документы на оборудование</Jump></div>
 </Section>
 </>;}
