'use client';
import { useEffect, useRef, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import './HomeEngineeringCharts.css';

function useChartReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { threshold: .45, rootMargin: '0px 0px -48px 0px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return [ref, visible];
}

// Power of one unit, not total site capacity or a growth series.
const deliveries = [
  { id: 'nur-esil', title: 'Подстанция «Нур-Есил»', model: 'ТДТН', power: 16, quantity: 2 },
  { id: 'yassy', title: 'Подстанция «Яссы»', model: 'ТРДН', power: 40, quantity: 2 },
  { id: 'nura', title: 'Подстанция «Нура»', model: 'АОДЦТН', power: 167, quantity: 3 },
];

export function DeliveryPowerChart() {
  const [ref, visible] = useChartReveal();
  return <E as="section" className="home-power-section" id="delivery-power">
    <div className="site-container home-chart-layout">
      <div className="home-chart-intro">
        <E as="p" className="site-eyebrow">ОПЫТ ПОСТАВОК</E>
        <E as="h2">Разные мощности.<br />Реальные объекты.</E>
        <E as="p">От городских подстанций до магистральной сети — три поставки оборудования Asia Trafo из опубликованного референс-листа.</E>
        <Link href="/documents/asia-trafo-references-2019-2023.pdf" className="site-text-link">Референс-лист 2019–2023 →</Link>
      </div>
      <div>
        <E as="p" className="home-chart-caption">Номинальная мощность одного трансформатора, МВА</E>
        <div ref={ref} className={`home-power-chart${visible ? ' is-visible' : ''}`}>
          {deliveries.map((item, index) => <Link key={item.id} href={`/projects/${item.id}`} className="home-power-row" style={{ '--power-width': `${item.power / 167 * 100}%`, '--chart-delay': `${index * 120}ms` }}>
            <div className="home-power-row-heading"><E as="h3">{item.title}</E><strong>{item.power}<E as="small">МВА</E></strong></div>
            <div className="home-power-track" aria-hidden="true"><span /></div>
            <div className="home-power-row-footer"><E as="span">{item.model} · {item.quantity} единицы оборудования</E><E as="span">Кейс поставки ↗</E></div>
          </Link>)}
        </div>
        <E as="p" className="home-chart-note">Сравнивается мощность одного изделия. Это не суммарная мощность подстанции и не график роста компании.</E>
      </div>
    </div>
  </E>;
}

const voltageClasses = ['0,4', '35', '110', '220', '500'];
export function VoltageClassChart() {
  const [ref, visible] = useChartReveal();
  return <E as="section" className="home-voltage-section" id="voltage-classes">
    <div className="site-container">
      <div className="home-voltage-heading">
        <div><E as="p" className="site-eyebrow">КЛАССЫ НАПРЯЖЕНИЯ</E><E as="h2">От распределения<br />до большой энергетики.</E></div>
        <E as="p">Распределительное оборудование АЭМЗ и силовые трансформаторы Asia Trafo работают на разных уровнях энергетической инфраструктуры.</E>
      </div>
      <div ref={ref} className={`home-voltage-chart${visible ? ' is-visible' : ''}`}>
        <div className="home-voltage-rail" aria-hidden="true"><span /></div>
        {voltageClasses.map((value, index) => <div className="home-voltage-node" key={value} style={{ '--node-delay': `${index * 160}ms` }}>
          <span className="home-voltage-dot" aria-hidden="true" />
          <strong>{value}<E as="small">кВ</E></strong>
          <E as="span">{index < 2 ? 'АЭМЗ' : 'Asia Trafo'}</E>
        </div>)}
      </div>
      <div className="home-voltage-details">
        <Link href="/manufacturers/aemz"><E as="span">Распределение и управление</E><E as="strong">Оборудование класса 0,4–35 кВ</E><E as="small">Алматинский электромеханический завод ↗</E></Link>
        <Link href="/manufacturers/asia-trafo"><E as="span">Передача и преобразование</E><E as="strong">Трансформаторы 110, 220 и 500 кВ</E><E as="small">Asia Trafo ↗</E></Link>
      </div>
      <E as="p" className="home-voltage-note">Классы из опубликованных профилей предприятий. Конкретное исполнение и сочетание напряжений уточняются для каждого изделия.</E>
    </div>
  </E>;
}
