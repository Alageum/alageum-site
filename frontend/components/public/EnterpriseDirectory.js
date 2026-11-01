'use client';

import { useEffect, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import { useEnterpriseMapPreview } from './EnterpriseMapPreview';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/components/locale/navigation';
import { mapLocations, mapCities, locationsInCity } from '@/lib/public/enterprise-map-locations';
import { cityPoint } from '@/lib/public/company';
import { mapRegions, regionViewport } from '@/lib/public/enterprise-map-regions';

export default function EnterpriseDirectory() {
  const { mapRef, open, focus, close, previewLayer, previewCities, previewId } = useEnterpriseMapPreview();
  const [hoveredRegion, setHoveredRegion] = useState(null);
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const city = mapCities.find(item => item.title === params.get('city'));
  const region = city ? undefined : mapRegions.find(item => item.cities.length > 0 && String(item.osmId) === params.get('region'));
  const activeRegion = mapRegions.find(item => item.osmId === hoveredRegion) || region;
  const viewport = city ? { ...cityPoint(city), scale: 7 } : region ? regionViewport(region) : null;
  const scale = viewport?.scale || 1;

  useEffect(() => {
    if (city) {
      open(city.title, mapRef.current?.querySelector(`[data-city="${city.id}"]`), true);
    } else if (region) {
      const cities = mapCities.filter(item => region.cities.includes(item.id)).map(item => item.title);
      open(region.title, mapRef.current?.querySelector(`[data-region="${region.osmId}"]`), true, cities);
    } else close();
  }, [city, region, open, close, mapRef]);

  function navigate(next) {
    router.push(`${pathname}${next.size ? `?${next}` : ''}`, { scroll: false });
  }
  function selectCity(value) {
    setHoveredRegion(null);
    if (city?.title === value) {
      open(value, mapRef.current?.querySelector(`[data-city="${city.id}"]`), true);
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.delete('region');
    if (value === 'all') next.delete('city'); else next.set('city', value);
    navigate(next);
    if (value === 'all') close();
  }
  function selectRegion(item) {
    if (!item.cities.length) return;
    setHoveredRegion(null);
    if (region?.osmId === item.osmId) {
      selectCity('all');
      return;
    }
    const next = new URLSearchParams(params.toString());
    next.delete('city');
    next.set('region', String(item.osmId));
    navigate(next);
  }
  return <>
    {previewLayer}
    <E as="section" className="corp-geography" aria-label="География предприятий и офисов">
      <E as="div" className="corp-geo-sidebar">
        <E as="p" className="site-eyebrow">КАЗАХСТАН / ВЫБЕРИТЕ ГОРОД</E>
        <E as="h2">Заводы и офисы.<br />Выберите город.</E>
        <E as="div" className="corp-city-filter" aria-label="Город предприятия">
          <E as="button" type="button" aria-pressed={!city && !region} onClick={() => selectCity('all')}>Заводы и офисы <E as="span">{mapLocations.length.toString().padStart(2, '0')}</E></E>
          {mapCities.map(item => <E as="button" type="button" aria-pressed={city?.id === item.id} key={item.id} onClick={() => selectCity(item.title)}>{item.title}<E as="span">{locationsInCity(item.title).length.toString().padStart(2, '0')}</E></E>)}
        </E>
      </E>
      <E as="div" ref={mapRef} className="corp-map-panel">
        <E as="span" className="corp-map-label site-metadata">{region ? region.title : 'ПРОИЗВОДСТВО / ИНЖИНИРИНГ'}</E>
        {viewport && <E as="button" className="corp-map-reset" type="button" onClick={() => selectCity('all')}>← Вся карта</E>}
        <E as="div" className={`corp-map${viewport ? ' is-zoomed' : ''}`} style={{ '--map-scale': scale, '--region-lift': `${-7 / scale}px`, '--pin-scale': 1 / scale }}>
          <div className="corp-map-scene" style={{ transform: viewport ? `translate(calc(var(${region ? '--enterprise-region-focus-x, 28%' : '--enterprise-focus-x, 34%'}) - ${viewport.x / 820 * 100}%), ${50 - viewport.y / 460 * 100}%) scale(${scale})` : 'none', transformOrigin: viewport ? `${viewport.x / 820 * 100}% ${viewport.y / 460 * 100}%` : 'center' }}>
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
              const lifted = activeRegion?.cities.includes(item.id) || region?.cities.includes(item.id);
              const visible = !viewport || (city ? city.id === item.id : region.cities.includes(item.id));
              return <E as="button" key={item.id} data-city={item.id} type="button" aria-label={`Показать предприятия: ${item.title}`} aria-pressed={city?.id === item.id} className={`corp-map-pin label-${item.labelSide}${previewCities.includes(item.title) ? ' is-preview' : ''}${lifted ? ' is-lifted' : ''}${!visible ? ' is-outside' : ''}`} aria-controls={previewId} aria-expanded={previewCities.includes(item.title)} style={{ left: `${point.x / 820 * 100}%`, top: `${point.y / 460 * 100}%` }}
                onPointerEnter={event => { if (event.pointerType === 'mouse') { setHoveredRegion(mapRegions.find(region => region.cities.includes(item.id))?.osmId || null); open(item.title, event.currentTarget); } }} onPointerLeave={() => setHoveredRegion(null)}
                onFocus={event => focus(item.title, event.currentTarget)} onClick={event => { selectCity(item.title); open(item.title, event.currentTarget, true); }}>
                <i aria-hidden="true" /><E as="span">{item.title}</E>
              </E>;
            })}
            <E as="span" className="corp-country-name" aria-hidden="true">КАЗАХСТАН</E>
          </div>
        </E>
        <E as="div" className="corp-map-legend"><E as="span">Нажмите на область, чтобы посмотреть заводы и офисы</E></E>
        <E as="p" className="corp-map-note">Маркеры обозначают города, а не точные адреса заводов.<br />Границы областей: <E as="a" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</E> · Центры городов: <E as="a" href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer">GeoNames</E> / OpenStreetMap</E>
      </E>
    </E>
  </>;
}
