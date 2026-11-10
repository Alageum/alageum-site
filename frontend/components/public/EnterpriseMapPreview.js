'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import { mapLocations, mapContacts, locationsInCity } from '@/lib/public/enterprise-map-locations';
import { getManufacturerPhoto } from '@/lib/public/photography';
import { insidePartnerHoverZones } from '@/lib/public/partnerHover';
import './EnterpriseMapPreview.css';

function LocationSources({ item }) {
  return <div className="enterprise-location-sources">
    {item.aliases?.length > 0 && <E as="p">В 2ГИС: {item.aliases.join(' / ')}</E>}
    {item.colocated && <E as="p">{item.colocated}</E>}
    {item.alternateAddress && <E as="p">{item.alternateAddress}</E>}
    {item.kind === 'enterprise' && item.listingSource && <a href={item.listingSource} target="_blank" rel="noopener noreferrer"><E>Адрес в 2ГИС ↗</E></a>}
  </div>;
}

function LocationDetails({ item, photo }) {
  const contact = mapContacts[item.id];
  return <div className="enterprise-map-preview-details">
    <E as="p" className="enterprise-map-kind">{item.kind === 'office' ? 'Офис продаж' : 'Предприятие'}</E>
    <E as="h3">{item.title}</E>
    {photo && <E as="figure"><Image src={photo.path} alt={photo.caption} width={760} height={480} sizes="390px" /><E as="figcaption">{photo.caption}</E></E>}
    <E as="p" className="enterprise-map-preview-description">{item.description}</E>
    <E as="h4">Специализация</E><E as="ul">{item.capabilities.map(value => <E as="li" key={value}>{value}</E>)}</E>
    <div className="enterprise-map-preview-contact"><E as="p">{contact.label}</E><E as="address">{contact.city}, {contact.address}</E><E as="a" href={`tel:${contact.tel}`}>{contact.phone}{contact.extension ? ` · ${contact.extension}` : ''}</E><E as="a" href={`mailto:${contact.email}`}>{contact.email}</E></div>
    <LocationSources item={item} />
    <Link href={item.href} className="site-text-link" target={item.kind === 'office' ? '_blank' : undefined} rel={item.kind === 'office' ? 'noopener noreferrer' : undefined}>{item.kind === 'office' ? 'Открыть в 2ГИС ↗' : 'Профиль предприятия →'}</Link>
  </div>;
}

export function useEnterpriseMapPreview() {
  const mapRef = useRef(null);
  const cardRef = useRef(null);
  const anchorRef = useRef(null);
  const skipFocusRef = useRef(null);
  const timerRef = useRef(null);
  const pinnedRef = useRef(false);
  const [preview, setPreview] = useState(null);
  const [enterpriseId, setEnterpriseId] = useState(null);
  const id = useId();
  const cancelClose = useCallback(() => { window.clearTimeout(timerRef.current); timerRef.current = null; }, []);
  const close = useCallback(() => { cancelClose(); pinnedRef.current = false; setPreview(null); }, [cancelClose]);

  const open = useCallback((city, anchor, pinned = false, cities = null) => {
    if (pinnedRef.current && !pinned) return;
    if (!mapRef.current || !anchor) return;
    const items = cities ? mapLocations.filter(item => cities.includes(mapContacts[item.id]?.city)) : locationsInCity(city);
    if (!items.length && !cities) return;
    cancelClose();
    pinnedRef.current = pinned;
    anchorRef.current = anchor;
    const map = mapRef.current.getBoundingClientRect();
    const pin = anchor.getBoundingClientRect();
    const compact = window.innerWidth <= 760;
    const preferredWidth = compact ? 320 : items.length > 1 && window.innerWidth >= 1050 ? 600 : 390;
    const width = Math.min(preferredWidth, window.innerWidth - 32);
    let left;
    let top;
    let height;
    if (compact) {
      left = Math.max(16, Math.min(pin.left + pin.width / 2 - width / 2, window.innerWidth - width - 16));
      const below = window.innerHeight - pin.bottom - 30;
      const above = pin.top - 30;
      const showBelow = below >= 180 || below >= above;
      height = Math.min(440, Math.max(120, showBelow ? below : above));
      top = showBelow ? pin.bottom + 14 : Math.max(16, pin.top - height - 14);
    } else {
      // Anchor to the actual city marker, flipping sides at the viewport edge.
      const onRight = pin.right + width + 18 <= window.innerWidth - 16;
      left = onRight ? pin.right + 18 : Math.max(16, pin.left - width - 18);
      height = Math.min(620, window.innerHeight - 32);
      top = Math.max(16, Math.min(pin.top - 60, window.innerHeight - height - 16));
    }
    setPreview({ city, cities, pinned, container: mapRef.current, map: { left: Math.max(0, map.left), top: Math.max(0, map.top), right: Math.min(window.innerWidth, map.right), bottom: Math.min(window.innerHeight, map.bottom) }, card: { left, top, width, maxHeight: height } });
    setEnterpriseId(items[0]?.id || null);
  }, [cancelClose]);

  const focus = useCallback((city, anchor) => {
    if (skipFocusRef.current === anchor) { skipFocusRef.current = null; return; }
    open(city, anchor);
  }, [open]);
  const restoreFocus = useCallback(() => {
    close();
    skipFocusRef.current = anchorRef.current;
    anchorRef.current?.focus({ preventScroll: true });
  }, [close]);

  useEffect(() => {
    if (!preview) return;
    const move = event => {
      if (pinnedRef.current || event.pointerType !== 'mouse') return;
      const point = { x: event.clientX, y: event.clientY };
      if (insidePartnerHoverZones(point, anchorRef.current?.getBoundingClientRect(), cardRef.current?.getBoundingClientRect())) { cancelClose(); return; }
      if (!timerRef.current) timerRef.current = window.setTimeout(close, 220);
    };
    const escape = event => {
      if (event.key !== 'Escape') return;
      const restore = cardRef.current?.contains(document.activeElement);
      close();
      if (restore) { skipFocusRef.current = anchorRef.current; anchorRef.current?.focus({ preventScroll: true }); }
    };
    const dismissHover = () => { if (!pinnedRef.current) close(); };
    const leaveWindow = event => { if (!pinnedRef.current && !event.relatedTarget) close(); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerout', leaveWindow);
    window.addEventListener('keydown', escape);
    window.addEventListener('scroll', dismissHover, { passive: true });
    window.addEventListener('resize', dismissHover);
    return () => {
      cancelClose();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', dismissHover);
      window.removeEventListener('resize', dismissHover);
    };
  }, [preview, close, cancelClose]);

  const items = !preview ? [] : preview.cities ? mapLocations.filter(item => preview.cities.includes(mapContacts[item.id]?.city)) : locationsInCity(preview.city);
  const active = items.find(item => item.id === enterpriseId) || items[0];
  const multiple = items.length > 1;
  const map = preview?.map;
  const heading = preview && <>
    <div className="enterprise-map-preview-top"><E as="p" className="site-eyebrow">ЗАВОДЫ И ОФИСЫ ГРУППЫ</E><E as="button" type="button" className="enterprise-map-preview-close" aria-label="Закрыть справку о предприятии" onClick={restoreFocus}>×</E></div>
    <E as="p" className="enterprise-map-preview-city">{preview.city}</E>
    {preview.cities && <E as="p" className="enterprise-region-count" role="status">Объектов: {items.length}</E>}
  </>;
  const previewLayer = preview && createPortal(<div className={`enterprise-map-preview-layer${preview.pinned ? ' is-pinned' : ''}${multiple ? ' is-multi' : ''}`}>
    {/* Four independent panels leave the actual live map entirely uncovered. */}
    {!preview.pinned && <><div className="enterprise-map-shade" style={{ left: 0, top: 0, right: 0, height: map.top }} onClick={close} />
    <div className="enterprise-map-shade" style={{ left: 0, top: map.bottom, right: 0, bottom: 0 }} onClick={close} />
    <div className="enterprise-map-shade" style={{ left: 0, top: map.top, width: map.left, height: map.bottom - map.top }} onClick={close} />
    <div className="enterprise-map-shade" style={{ left: map.right, top: map.top, right: 0, height: map.bottom - map.top }} onClick={close} />
    </>}
    <E as="aside" ref={cardRef} id={id} className="enterprise-map-preview" style={preview.pinned ? undefined : preview.card} aria-label="Справка о предприятии" onPointerEnter={cancelClose}>
      {!multiple && heading}
      {active ? <div className={multiple ? 'enterprise-map-split' : undefined}>
        {multiple && <div className="enterprise-map-picker-window">
          {heading}
          <E as="div" className="enterprise-map-choices" role="group" aria-label="Выберите предприятие или офис">
            {items.map(item => {
              const photo = getManufacturerPhoto(item.id);
              return <button className="enterprise-map-choice" key={item.id} type="button" aria-pressed={item.id === active.id} aria-controls={`${id}-details`}
                onPointerEnter={event => { if (event.pointerType === 'mouse') setEnterpriseId(item.id); }}
                onClick={() => setEnterpriseId(item.id)}>
                <span className="enterprise-map-choice-image" aria-hidden="true">
                  {photo ? <Image src={photo.path} alt="" width={80} height={80} sizes="40px" /> :
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>}
                </span>
                <span className="enterprise-map-choice-name">
                  <E as="strong">{item.short}</E>
                  <E as="small">{preview.cities ? mapContacts[item.id].city : item.kind === 'office' ? 'Офис продаж' : 'Предприятие'}</E>
                </span>
              </button>;
            })}
          </E>
        </div>}
        <div key={active.id} id={`${id}-details`} className={multiple ? 'enterprise-map-detail-pane' : undefined}>
          <LocationDetails item={active} photo={getManufacturerPhoto(active.id)} />
        </div>
      </div> : <E as="p">В этой области пока нет предприятий, представленных на карте. Выберите другую область или город.</E>}

    </E>
  </div>, preview.pinned ? preview.container : document.body);

  return { mapRef, open, focus, close, previewLayer, previewCity: preview?.cities ? undefined : preview?.city, previewCities: preview?.cities || (preview ? [preview.city] : []), previewId: preview ? id : undefined };
}
