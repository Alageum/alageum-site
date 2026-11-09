'use client';

import { useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import useHydrated from '@/components/ui/useHydrated';
import CorporateArrow from './CorporateArrow';
import CorporatePhoto from './CorporatePhoto';

export default function HomeEnterpriseExplorer({ cities, regions, overviewPhoto }) {
  const ready = useHydrated();
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const selected = cities.find(city => city.id === selectedId);
  const highlighted = cities.find(city => city.id === hoveredId) || selected;
  const cityMapHref = selected ? `/manufacturers?city=${encodeURIComponent(selected.title)}#company-map` : '/manufacturers#company-map';

  function reset() {
    setSelectedId(null);
    setHoveredId(null);
  }

  function cityControls(city) {
    return {
      type: 'button',
      disabled: !ready,
      'aria-pressed': selectedId === city.id,
      'aria-controls': 'home-map-details',
      'data-highlighted': highlighted?.id === city.id,
      onPointerEnter: event => { if (event.pointerType === 'mouse') setHoveredId(city.id); },
      onPointerLeave: () => setHoveredId(null),
      onFocus: () => setHoveredId(city.id),
      onBlur: () => setHoveredId(null),
      onClick: () => {
        setSelectedId(current => current === city.id ? null : city.id);
        setHoveredId(null);
      },
    };
  }

  return <div className="home-map" onKeyDown={event => { if (event.key === 'Escape' && selected) reset(); }}>
    <div className="home-map-atlas">
      <div className="home-map-toolbar">
        <E as="span" className="site-eyebrow">КАЗАХСТАН</E>
        <E as="button" type="button" onClick={reset} disabled={!ready} aria-disabled={!selected} className="home-map-reset">Вся карта</E>
      </div>
      <div className="home-map-plot">
        <svg viewBox="0 0 820 460" aria-hidden="true" className="home-map-artwork">
          {regions.map(region => <path key={region.id} data-home-map-region={region.id} d={region.path} vectorEffect="non-scaling-stroke"
            className={highlighted?.region === region.id ? 'is-highlighted' : undefined} />)}
          <g className="home-map-leaders">
            {cities.filter(city => city.point.x !== city.pin.x).map(({ id, point, pin }) => <g key={id} className={highlighted?.id === id ? 'is-highlighted' : undefined}>
              <line x1={point.x} y1={point.y} x2={pin.x} y2={pin.y} vectorEffect="non-scaling-stroke" />
              <circle cx={point.x} cy={point.y} r="4" vectorEffect="non-scaling-stroke" />
            </g>)}
          </g>
        </svg>
        {cities.map(city => <button key={city.id} className="home-map-pin" {...cityControls(city)}
          style={{ left: `${city.pin.x / 820 * 100}%`, top: `${city.pin.y / 460 * 100}%` }}>
          <span className="home-map-pin-dot" aria-hidden="true">{city.number}</span>
          <E as="span" className="home-map-pin-name">{city.title}</E>
        </button>)}
      </div>
      <div className="home-map-city-picker">
        <E as="p" id="home-map-city-picker">Выберите город</E>
        <ul aria-labelledby="home-map-city-picker">
          {cities.map(city => <li key={city.id}>
            <button className="home-map-city" {...cityControls(city)}>
              <span aria-hidden="true">{city.number}</span><E>{city.title}</E>
            </button>
          </li>)}
        </ul>
      </div>
      <p className="home-map-credit">
        <E>Границы областей:</E>{' '}<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a>
        {' · '}<E>Координаты городов:</E>{' '}<a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</a>
      </p>
    </div>
    <section id="home-map-details" className="home-map-details" aria-labelledby="home-map-details-title">
      <div className="home-map-detail-heading">
        <E as="p" className="site-eyebrow">{selected ? 'ПРЕДПРИЯТИЯ' : 'ГЕОГРАФИЯ ПРОИЗВОДСТВА'}</E>
        <h3 id="home-map-details-title" aria-live="polite"><E>{selected?.title || 'Города производства'}</E></h3>
      </div>
      <div key={selectedId || 'overview'} className="home-map-detail-content">
        <CorporatePhoto photo={selected ? selected.photo : overviewPhoto} className="home-map-photo" sizes="(max-width: 760px) 90vw, 360px" />
        {selected ? <ul className="home-map-factories">
          {selected.factories.map(factory => <li key={factory.id}>
            <Link href={factory.href}><E>{factory.title}</E><CorporateArrow /></Link>
            <p>{factory.capabilities.map((capability, index) => <span key={capability}>{index > 0 && ' · '}<E>{capability}</E></span>)}</p>
          </li>)}
        </ul> : <E as="p" className="home-map-intro">Выберите город на карте или в списке, чтобы посмотреть предприятия и их специализацию.</E>}
      </div>
      <Link className="home-map-directory" href={cityMapHref}>
        {selected ? 'Адреса и контакты в городе' : 'Карта предприятий и офисов'} <CorporateArrow direction="right" />
      </Link>
    </section>
  </div>;
}
