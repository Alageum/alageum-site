import E from '@/components/locale/LocaleElement';
import './sealed-transformer.css';

export default function SealedTransformer(){return <figure className="tmg-explainer">
 <div className="tmg-drawing" aria-hidden="true">
  <svg viewBox="0 0 560 340" fill="none">
   <defs><pattern id="tmg-oil-hatch" width="12" height="12" patternUnits="userSpaceOnUse"><path d="m0 12 12-12" stroke="#aa8351" strokeOpacity=".14"/></pattern></defs>
   <path className="tmg-terminal" d="M170 62V32h18v30m83 0V32h18v30m83 0V32h18v30M160 40h38m63 0h38m63 0h38"/>
   <rect x="113" y="75" width="334" height="224" rx="12" className="tmg-oil"/>
   <rect x="113" y="75" width="334" height="224" rx="12" fill="url(#tmg-oil-hatch)"/>
   <path className="tmg-tank" d="M113 75h334v212q0 12-12 12H125q-12 0-12-12V75ZM100 64h360v11H100zM142 300v12m276-12v12M135 313h28m241 0h28"/>
   <path className="tmg-core" d="M187 129h186v116H187zM212 129v116m68-116v116m68-116v116"/>
   {[212,280,348].map(x=><g key={x}><rect x={x-19} y="152" width="38" height="70" rx="7" className="tmg-winding"/>{[164,176,188,200,212].map(y=><path key={y} d={`M${x-19} ${y}h38`} className="tmg-winding-line"/>)}</g>)}
   <path className="tmg-callout" d="M113 110H62V86M402 264h96v-29"/>
   <circle cx="62" cy="70" r="16" className="tmg-marker"/><text x="62" y="75" textAnchor="middle">1</text>
   <circle cx="498" cy="219" r="16" className="tmg-marker"/><text x="498" y="224" textAnchor="middle">2</text>
  </svg>
  <E as="p">Условный разрез</E>
 </div>
 <div className="tmg-explanation">
  <div><span className="tmg-key" aria-hidden="true">1</span><div><E as="h3">Герметичный бак</E><E as="p">Масло не контактирует с окружающим воздухом.</E></div></div>
  <div><span className="tmg-key" aria-hidden="true">2</span><div><E as="h3">Полное заполнение маслом</E><E as="p">Без расширителя и воздушной подушки.</E></div></div>
 </div>
 <E as="figcaption">Схема поясняет принцип герметичного исполнения ТМГ. Геометрия и детали показаны условно; это не чертёж конкретного изделия.</E>
 </figure>;}
