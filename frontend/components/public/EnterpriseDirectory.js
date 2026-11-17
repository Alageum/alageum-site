'use client';

import { useEffect, useMemo, useReducer, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import EnterpriseMapDetails from './EnterpriseMapPreview';
import { useSearchParams } from 'next/navigation';
import { directoryCities as allMapCities, enterpriseDirectoryGroups, directoryItemsForCategory, mappedDirectoryItems } from '@/lib/public/enterprise-directory';
import { enterpriseMapReducer, readEnterpriseMapState, writeEnterpriseMapState, cityMovesWithRegion, resolveEnterpriseArea } from '@/lib/public/enterprise-map-state';
import { cityPoint } from '@/lib/public/company';
import { mapRegions as allMapRegions, regionViewport } from '@/lib/public/enterprise-map-regions';

export default function EnterpriseDirectory() {
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const params = useSearchParams();
  const [selection, dispatch] = useReducer(enterpriseMapReducer, params, readEnterpriseMapState);
  const { category } = selection;
  const mapLocations = useMemo(() => mappedDirectoryItems(category), [category]);
  const listedItems = useMemo(() => directoryItemsForCategory(category), [category]);
  const mapCities = useMemo(() => allMapCities.filter(city => mapLocations.some(item => item.contact.city === city.title)), [mapLocations]);
  const mapRegions = useMemo(() => allMapRegions.map(region => ({ ...region, cities: mapCities.filter(city => cityMovesWithRegion(city, region)).map(city => city.id) })), [mapCities]);
  const categoryTitle = enterpriseDirectoryGroups.find(group => group.id === category)?.title || 'Все организации';
  const { region, items: detailsItems, activeId } = resolveEnterpriseArea(mapLocations, mapCities, mapRegions, selection);
  const activeRegion = mapRegions.find(item => item.osmId === hoveredRegion) || region;
  const viewport = region ? regionViewport(region) : null;
  const scale = viewport?.scale || 1;
  const [detailChoice, setDetailChoice] = useState(null);
  const currentId = detailChoice || activeId;
  const activeCity = detailsItems.find(item => item.id === currentId)?.contact.city;

  useEffect(() => {
    const restore = () => {
      setHoveredRegion(null);
      setDetailChoice(null);
      dispatch({ type: 'restore', state: readEnterpriseMapState(new URLSearchParams(window.location.search)) });
    };
    const escape = event => {
      if (event.key !== 'Escape' || event.defaultPrevented || document.querySelector('dialog[open]')) return;
      const current = readEnterpriseMapState(new URLSearchParams(window.location.search));
      if (!current.organizationId && !current.cityId && !current.regionId) return;
      const next = enterpriseMapReducer(current, { type: 'reset' });
      setHoveredRegion(null); setDetailChoice(null);
      dispatch({ type: 'restore', state: next });
      const query = writeEnterpriseMapState(window.location.search, next).toString();
      window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('keydown', escape);
    return () => { window.removeEventListener('popstate', restore); window.removeEventListener('keydown', escape); };
  }, []);

  function choose(action) {
    const next = enterpriseMapReducer(selection, action);
    if (['category', 'organizationId', 'cityId', 'regionId'].every(key => next[key] === selection[key])) return;
    setHoveredRegion(null);
    setDetailChoice(null);
    dispatch(action);
    const query = writeEnterpriseMapState(window.location.search, next).toString();
    // Native history is integrated with Next's router. No server navigation or
    // page scroll occurs when changing this entirely local map selection.
    window.history.pushState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
  }
  function selectCategory(id) { choose({ type: 'category', id }); }
  function selectRegion(item) { if (item.cities.length) choose({ type: 'region', id: item.osmId }); }
  return <>
    <E as="section" className="corp-geography" aria-label="География предприятий и офисов">
      <E as="div" className="corp-geo-sidebar">
        <E as="p" className="site-eyebrow">КАЗАХСТАН</E>
        <E as="h2">Предприятия и офисы продаж</E>
        <div className="enterprise-category-filter-shell"><E as="div" className="corp-city-filter enterprise-category-filter" aria-label="Категории организаций">
          <E as="button" type="button" aria-pressed={category === 'all'} onClick={() => selectCategory('all')}>Все организации <E as="span">{directoryItemsForCategory().length}</E></E>
          {enterpriseDirectoryGroups.map(group => <div key={group.id}>
            <E as="button" type="button" aria-expanded={category === group.id} aria-controls={`directory-${group.id}`} onClick={() => selectCategory(group.id)}>{group.title}<E as="span">{group.items.length}</E></E>
            {category === group.id && <E as="ul" id={`directory-${group.id}`} className="enterprise-category-items">{listedItems.map(item => <E as="li" key={item.id}>{item.contact?.city ? <E as="button" type="button" aria-pressed={currentId === item.id} onClick={() => choose({ type: 'organization', id: item.id })}>{item.title}<E as="small">{item.contact.city}</E></E> : <><E as="span">{item.title}</E><E as="small">Местоположение уточняется</E></>}</E>)}</E>}
          </div>)}
        </E></div>
      </E>
      <E as="div" className="corp-map-panel">
        <E as="span" className="corp-map-label site-metadata">{region ? region.title : categoryTitle}</E>
        {region && <E as="button" className="corp-map-reset" type="button" onClick={() => choose({ type: 'reset' })}>← Вся карта</E>}
        <E as="div" className={`corp-map${viewport ? ' is-zoomed' : ''}`} style={{ '--map-scale': scale, '--region-lift': `${-7 / scale}px`, '--pin-scale': 1 / scale }}>
          <div className="corp-map-scene" style={{ transform: viewport ? `translate(calc(var(--enterprise-region-focus-x, 28%) - ${viewport.x / 820 * 100}%), ${50 - viewport.y / 460 * 100}%) scale(${scale})` : 'none', transformOrigin: viewport ? `${viewport.x / 820 * 100}% ${viewport.y / 460 * 100}%` : 'center' }}>
            <svg viewBox="0 0 820 460" role="group" aria-label="Области Казахстана — выберите область">
              <defs>
                <linearGradient id="enterprise-country-gray" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="820" y2="460"><stop offset="0%" stopColor="#747474" /><stop offset="55%" stopColor="#555555" /><stop offset="100%" stopColor="#383838" /></linearGradient>
                <pattern id="geo-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".7" fill="currentColor" opacity=".22" /></pattern>
                <clipPath id="enterprise-country-clip">{mapRegions.map(item => <path key={item.osmId} d={item.path} />)}</clipPath>
              </defs>
              {mapRegions.map(item => <path key={item.osmId} data-region={item.osmId} d={item.path} role={item.cities.length ? 'button' : undefined} tabIndex={item.cities.length ? 0 : undefined} aria-label={item.cities.length ? `Показать предприятия: ${item.title}` : item.title} aria-pressed={item.cities.length ? region?.osmId === item.osmId : undefined} data-has-enterprises={item.cities.length > 0} className={`corp-country-fill corp-region-surface${(activeRegion?.osmId === item.osmId || region?.osmId === item.osmId) ? ' is-hovered' : ''}`} vectorEffect="non-scaling-stroke"
                onPointerEnter={event => { if (event.pointerType === 'mouse') setHoveredRegion(item.osmId); }} onPointerLeave={() => setHoveredRegion(null)}
                onClick={() => selectRegion(item)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectRegion(item); } }} />)}
              <rect width="820" height="460" className="corp-map-grid" fill="url(#geo-grid)" clipPath="url(#enterprise-country-clip)" />
              {mapRegions.map(item => <path key={item.osmId} d={item.path} className="corp-region-boundary" vectorEffect="non-scaling-stroke" />)}
              {region && activeRegion?.osmId !== region.osmId && <path d={region.path} className="corp-region-raised is-selected" vectorEffect="non-scaling-stroke" />}
              {activeRegion && <path key={activeRegion.osmId} d={activeRegion.path} className={`corp-region-raised${region?.osmId === activeRegion.osmId ? ' is-selected' : ''}`} vectorEffect="non-scaling-stroke" />}
            </svg>
            {mapCities.map(item => {
              const point = cityPoint(item);
              const lifted = cityMovesWithRegion(item, activeRegion) || cityMovesWithRegion(item, region);
              return <E as="button" key={item.id} data-city={item.id} type="button" aria-label={`Показать предприятия: ${item.title}`} aria-pressed={activeCity === item.title} className={`corp-map-pin label-${item.labelSide}${activeCity === item.title ? ' is-preview' : ''}${lifted ? ' is-lifted' : ''}`} aria-controls="enterprise-directory-details" aria-expanded={Boolean(region?.cities.includes(item.id))} style={{ left: `${point.x / 820 * 100}%`, top: `${point.y / 460 * 100}%` }}
                onClick={() => choose({ type: 'city', id: item.id })}>
                <i aria-hidden="true" /><E as="span">{item.title}</E>
              </E>;
            })}
            <E as="span" className="corp-country-name" aria-hidden="true">КАЗАХСТАН</E>
          </div>
        </E>
        <EnterpriseMapDetails items={detailsItems} activeId={currentId} onSelect={setDetailChoice} categoryTitle={categoryTitle} areaTitle={region?.title} />
        <E as="div" className="corp-map-legend"><E as="span">Выберите область или город. Повторное нажатие на область вернёт всю карту.</E></E>
        <E as="p" className="corp-map-note">Маркеры обозначают города, а не точные адреса заводов.<br />Границы областей: <E as="a" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</E> · Центры городов: <E as="a" href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</E> / OpenStreetMap</E>
      </E>
    </E>
  </>;
}
