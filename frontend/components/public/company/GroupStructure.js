import {localSourceHref} from '@/lib/public/localResources';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporatePhoto from '../CorporatePhoto';
import {getManufacturerPhoto} from '@/lib/public/photography';
import {companySource} from '@/lib/public/company';
import GroupStructureMotion from './GroupStructureMotion';
import './group-structure.css';
const directions=[
 {id:'transformers',label:'ТРАНСФОРМАТОРЫ',title:'Трансформаторные заводы',text:'Силовые и распределительные трансформаторы для электросетей и промышленных объектов.',photo:'ktz',plants:[['КТЗ','ktz'],['Asia Trafo','asia-trafo'],['УТЗ','utz'],['ПЭТЗ','petz']],href:'/manufacturers#company-map',action:'Посмотреть заводы на карте'},
 {id:'distribution',label:'РАСПРЕДЕЛИТЕЛЬНОЕ ОБОРУДОВАНИЕ',title:'Заводы электрооборудования',text:'Распределительные устройства, комплектные подстанции и шкафное оборудование.',photo:'aemz',plants:[['АЭМЗ','aemz'],['Батыс Электрик','batys-electric'],['Ural Electric','ural-electric']],href:'/manufacturers#technology',action:'Как устроено производство'},
 {id:'engineering',label:'СТРОИТЕЛЬСТВО И МОНТАЖ',title:'Инжиниринг и строительство',text:'Проектирование, строительство, электромонтаж и пусконаладка энергообъектов.',photo:'elmo',plants:[['Электромонтаж','elmo']],href:'/manufacturers/elmo',action:'Об «Электромонтаже»'},
];
function DirectionIcon({id}){return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">{id==='transformers'?<><path d="M9 10v28m30-28v28M15 12c10 0 10 8 0 8 10 0 10 8 0 8 10 0 10 8 0 8m18-24c-10 0-10 8 0 8-10 0-10 8 0 8-10 0-10 8 0 8M23 8v32m3-32v32"/></>:id==='distribution'?<><path d="M6 10h36v30H6zM18 10v30m12-30v30M12 5v5m12-5v5m12-5v5M10 18h4m8 0h4m8 0h4M12 25v6m12-6v6m12-6v6"/></>:<><path d="m24 5-9 36m9-36 9 36M12 15h24M9 24h30M18 15l12 9-12 11h12M15 41h18M5 15h7m24 0h7M5 24h4m30 0h4"/></>}</svg>;}
export default function GroupStructure(){return <GroupStructureMotion>
 <header className="grp-intro"><E as="p" className="grp-eyebrow">СТРУКТУРА ГРУППЫ</E><E as="h2" id="group-structure-title">Производство, проектирование и строительство</E></header>
 <div className="grp-network" aria-hidden="true"><span>ALAGEUM ELECTRIC</span><svg viewBox="0 0 1000 48" preserveAspectRatio="none"><path d="M166.667 47V24H833.333V47M500 8V47"/><path className="grp-network-current" pathLength="1" d="M500 8V24H166.667V47M500 24H833.333V47M500 24V47"/><circle cx="166.667" cy="24" r="3"/><circle cx="500" cy="24" r="3"/><circle cx="833.333" cy="24" r="3"/></svg></div>
 <div className="grp-cards">{directions.map((item,index)=><article key={item.id} className="grp-card" style={{'--grp-order':index}}>
  <div className="grp-photo"><CorporatePhoto photo={getManufacturerPhoto(item.photo)} sizes="(max-width:760px) 100vw, 33vw"/><span className="grp-icon"><DirectionIcon id={item.id}/></span></div>
  <div className="grp-card-body"><div className="grp-card-caption"><span aria-hidden="true">0{index+1}</span><E>{item.label}</E></div><E as="h3">{item.title}</E><E as="p" className="grp-description">{item.text}</E>
   <E as="ul" className="grp-plants" aria-label={item.title}>{item.plants.map(([name,id])=><li key={id}><Link href={`/manufacturers/${id}`}>{name}<span aria-hidden="true">↗</span></Link></li>)}</E>
   <Link href={item.href} className="grp-direction-link"><E>{item.action}</E><span aria-hidden="true">↗</span></Link>
  </div>
 </article>)}</div>
 <div id="responsibility" className="grp-responsibility"><div><E as="p" className="grp-eyebrow">РАБОТЫ ПО ПРОЕКТУ</E><E as="h3">Кто выполняет работы</E></div><div className="grp-role-summary"><ul>{[['Производитель','Изготавливает оборудование по согласованным параметрам.'],['Проектировщик','Готовит расчёты и проектную документацию.'],['Монтаж и ввод','Устанавливает оборудование и проводит пусконаладку.']].map(([title,text])=><li key={title}><i aria-hidden="true"/><div><E as="strong">{title}</E><E as="p">{text}</E></div></li>)}</ul><E as="p" className="grp-case-note">В описании каждого проекта указано участие предприятий: поставка, строительство или реконструкция.</E><Link href="/projects" className="grp-project-link"><E>Проекты группы</E><span aria-hidden="true">↗</span></Link></div></div>
 <footer className="grp-source"><Link href={localSourceHref(companySource)}><E>Материалы о группе</E><span aria-hidden="true">↗</span></Link><E>На страницах предприятий указаны продукция и контакты.</E></footer>
 </GroupStructureMotion>;}
