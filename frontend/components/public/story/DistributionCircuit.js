import E from '@/components/locale/LocaleElement';
import DistributionCircuitMotion from './DistributionCircuitMotion';
import './distribution-circuit.css';

const stages=[
 ['Точка подключения','Напряжение на стороне подключения и технические условия.'],
 ['Трансформатор','Мощность и напряжения подбираются под расчётную нагрузку.'],
 ['Потребители','Состав нагрузки, режим работы и планируемое расширение сети.'],
];

function CircuitIcon({stage}){return <svg viewBox="0 0 100 80" fill="none" aria-hidden="true">
 {stage===0?<><path d="M8 40h15m54 0h15M23 12v56M77 12v56"/><path className="dc-icon-accent" d="M30 40c7-30 13-30 20 0s13 30 20 0"/><path className="dc-live-trace dc-live-wave" pathLength="1" d="M30 40c7-30 13-30 20 0s13 30 20 0"/><circle cx="8" cy="40" r="3"/><circle cx="92" cy="40" r="3"/></>:
 stage===1?<><path d="M5 40h16m58 0h16M50 9v10m0 42v10"/><circle cx="40" cy="40" r="21"/><circle className="dc-icon-accent" cx="60" cy="40" r="21"/><circle className="dc-live-trace dc-live-coil" pathLength="1" cx="40" cy="40" r="21"/><circle className="dc-live-trace dc-live-coil dc-live-coil-secondary" pathLength="1" cx="60" cy="40" r="21"/></>:
 <><path d="M10 25h80M24 25v15m52-15v15M50 10v15M12 70V40h24v30m28 0V40h24v30M5 70h90"/><path className="dc-live-trace dc-live-feed" pathLength="1" d="M50 10V25H24V40M50 25H76V40"/><path className="dc-icon-accent dc-live-windows" d="M42 70V47h16v23M18 49h12m-12 9h12m40-9h12m-12 9h12"/></>}
 </svg>;}

export default function DistributionCircuit(){return <DistributionCircuitMotion>
 <E as="h2">От подключения — к потребителю.</E>
 <div className="dc-route" aria-hidden="true"><span/><svg viewBox="0 0 1000 20" preserveAspectRatio="none"><path className="dc-route-base" d="M0 10H1000"/><path className="dc-route-draw" pathLength="1" d="M0 10H1000"/><path d="m490 3 9 7-9 7m-333-14 9 7-9 7m666-14 9 7-9 7"/></svg><span/></div>
 <ol className="dc-stages">{stages.map(([title,text],index)=><li key={title}>
  <div className="dc-stage-top"><span className="dc-stage-number" aria-hidden="true">0{index+1}</span><CircuitIcon stage={index}/></div>
  <E as="h3">{title}</E><E as="p">{text}</E>
 </li>)}</ol>
 <E as="figcaption">Принцип распределения электроэнергии. Состав оборудования определяется проектом; схема не заменяет однолинейную схему объекта.</E>
 </DistributionCircuitMotion>;}
