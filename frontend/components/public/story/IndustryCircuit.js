'use client';
import {useState} from 'react';
import E from '@/components/locale/LocaleElement';
import DistributionCircuitMotion from './DistributionCircuitMotion';
import './distribution-circuit.css';
import './industry-circuit.css';

function Diagram({vertical=false,source}){
 const main=vertical?'M80 80V145H155V180':'M150 75H340V138H415';
 const reserve=vertical?'M260 80V145H185V180':'M150 225H340V162H415';
 const output=vertical?'M170 230V310':'M485 150H720';
 const sources=vertical?[[80,55],[260,55]]:[[125,75],[125,225]];
 const [cx,cy]=vertical?[170,205]:[450,150];
 const [lx,ly]=vertical?[170,345]:[765,150];
 return <svg className={vertical?'ic-diagram-tall':'ic-diagram-wide'} viewBox={vertical?'0 0 340 410':'0 0 900 300'} fill="none" aria-hidden="true">
  <path className="ic-main-path" d={main}/><path className="ic-reserve-path" d={reserve}/><path className="ic-output-path" d={output}/>
  <path className="ic-current ic-main-current" pathLength="1" d={main}/><path className="ic-current ic-reserve-current" pathLength="1" d={reserve}/><path className="ic-current ic-output-current" pathLength="1" d={output}/>
  {sources.map(([x,y],i)=><g key={i} className={i?'ic-source ic-reserve-source':'ic-source ic-main-source'}><circle className="ic-source-halo" cx={x} cy={y} r="34"/><circle cx={x} cy={y} r="25"/><path d={`M${x-13} ${y}q6-20 13 0t13 0`}/><E as="text" x={x} y={y+(vertical?-38:48)} textAnchor="middle">{i?'Резервный ввод':'Основной ввод'}</E></g>)}
  <g className="ic-switch"><rect x={cx-35} y={cy-25} width="70" height="50" rx="5"/>
   {vertical?<><path d={`M155 180v15m30-15v15m-15 25v10`}/><circle className={source==='main'?'ic-contact-selected':''} cx="155" cy="195" r="3"/><circle className={source==='reserve'?'ic-contact-selected':''} cx="185" cy="195" r="3"/><circle cx="170" cy="220" r="3"/><path className="ic-switch-blade" d={source==='main'?'M170 220 155 195':'M170 220 185 195'}/></>:
   <><path d={`M415 138h17m-17 24h17m36-12h17`}/><circle className={source==='main'?'ic-contact-selected':''} cx="432" cy="138" r="3"/><circle className={source==='reserve'?'ic-contact-selected':''} cx="432" cy="162" r="3"/><circle cx="468" cy="150" r="3"/><path className="ic-switch-blade" d={source==='main'?'M468 150 432 138':'M468 150 432 162'}/></>}
   <E as="text" x={vertical?220:cx} y={vertical?cy+5:cy+52} textAnchor={vertical?'start':'middle'}>Распределение</E></g>
  <g className="ic-factory"><path d={`M${lx-45} ${ly+30}v-40l30-15v15l30-15v15h30v40zM${lx+25} ${ly-10}v-30h12v30M${lx-33} ${ly+7}h12m8 0h12m8 0h12M${lx-33} ${ly+19}h12m8 0h12m8 0h12`}/><E as="text" x={lx} y={ly+56} textAnchor="middle">Производство</E></g>
 </svg>;
}

export default function IndustryCircuit(){const [source,setSource]=useState('main');return <DistributionCircuitMotion className="industry-circuit">
 <E as="h2">Электроснабжение производства.</E>
 <div className="ic-network" data-source={source}>
 <div className="ic-network-toolbar">
 <E as="div" className="ic-source-controls" role="group" aria-label="Подсветить путь питания">
  <E as="button" type="button" aria-pressed={source==='main'} onClick={()=>setSource('main')}>Основной ввод</E>
  <E as="button" type="button" aria-pressed={source==='reserve'} onClick={()=>setSource('reserve')}>Резервный ввод</E>
 </E>
 <E as="p" className="ic-network-status" role="status"><span aria-hidden="true"/>{source==='main'?'Показан основной ввод':'Показан резервный ввод'}</E>
 </div><Diagram source={source}/><Diagram vertical source={source}/></div>
 <div className="ic-explanations">{[
  ['Основное питание','Для выбора мощности нужны нагрузка и режим работы оборудования.'],
  ['Резервирование','Резервное питание выбирают с учётом того, как долго оборудование может оставаться без электричества.'],
  ['Технологическая нагрузка','При расчёте учитывают пусковые токи и оборудование, которое нельзя отключать.'],
 ].map(([title,text],i)=><div key={title}><span aria-hidden="true">0{i+1}</span><E as="h3">{title}</E><E as="p">{text}</E></div>)}</div>
 <E as="figcaption">Нажмите «Основной ввод» или «Резервный ввод», чтобы увидеть путь тока. Это условная схема; рабочую схему разрабатывает проектировщик.</E>
 </DistributionCircuitMotion>;}
