'use client';
import {useEffect,useRef,useState} from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporatePhoto from './CorporatePhoto';
import {useLocale} from '@/components/locale/LocaleProvider';
import './CompanyMetrics.css';
import {companyMetricFacts,companyMetricsSource} from '@/lib/public/company-metrics';
const facts = companyMetricFacts.filter(fact => fact.label !== 'Сотрудников');
const operations = [
  { value: '15', label: 'действующих заводов' },
  { value: '4500', label: 'сотрудников' },
  { value: '30+', label: 'предприятий' },
  { value: '20', label: 'сервисных центров' },
  { value: '6', label: 'международных представительств' },
  { value: '2', label: 'проектных института' },
  { value: '1', label: 'научно-инженерный центр' },
];

function Counter({value,animate,decimals=0}){const locale=useLocale();const [display,setDisplay]=useState(value);useEffect(()=>{if(!animate||window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;let frame;const start=performance.now();function tick(time){const fraction=Math.min(1,(time-start)/1100);setDisplay(Math.round(value*(1-Math.pow(1-fraction,3))*10**decimals)/10**decimals);if(fraction<1)frame=requestAnimationFrame(tick);}frame=requestAnimationFrame(tick);return()=>cancelAnimationFrame(frame);},[animate,value,decimals]);return <span aria-label={String(value)}>{display.toLocaleString(locale==='en'?'en-US':locale==='kk'?'kk-KZ':'ru-RU',{minimumFractionDigits:decimals,maximumFractionDigits:decimals})}</span>;}
function OperationsFigures({ items, className }) {
  return <dl className={className}>
    {items.map(({ value, label }) => <div key={label}>
      <E as="dt">{label}</E>
      <dd>{value}</dd>
    </div>)}
  </dl>;
}

export default function CompanyMetrics({ operationsPhoto }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: .35, rootMargin: '0px 0px -60px 0px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return <E as="section" id="group-in-figures" className="company-metrics" aria-label="Масштаб группы">
    <div className="site-container">
      <div className="company-metrics-heading">
        <E as="p" className="site-eyebrow">МАСШТАБ ГРУППЫ</E>
        <E as="h2">Alageum Electric в цифрах</E>
        <E as="p">Выручка, прибыль и место Alageum Electric в рейтинге Forbes Kazakhstan.</E>
      </div>
      <div ref={ref} className="company-metrics-facts">
        {facts.map(fact => <article key={fact.label}>
          <strong><Counter value={fact.value} animate={visible} decimals={fact.decimals}/></strong>
          {fact.unit && <E as="span" className="company-metric-unit">{fact.unit}</E>}
          <E as="h3">{fact.label}</E>
          <E as="p">{fact.note}</E>
        </article>)}
      </div>
      <E as="p" className="company-metrics-source">Forbes Kazakhstan, декабрь 2025. Выручка и чистая прибыль — за 2024 год.</E>
      <Link href={companyMetricsSource.href} className="site-text-link" target="_blank" rel="noopener noreferrer">Источник: Forbes Kazakhstan ↗</Link>
      <section className="company-operations" aria-labelledby="company-operations-title">
        <div className="company-operations-feature">
          <div className="company-operations-lead">
            <E as="h3" id="company-operations-title">Предприятия и команда</E>
            <OperationsFigures items={operations.slice(0, 2)} className="company-operations-primary" />
          </div>
          <CorporatePhoto photo={operationsPhoto} className="company-operations-photo" sizes="(max-width: 640px) 100vw, 45vw" />
        </div>
        <OperationsFigures items={operations.slice(2)} className="company-operations-secondary" />
      </section>
    </div>
  </E>;
}
