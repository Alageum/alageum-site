'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import { manufacturers } from '@/lib/public/content';
import { enterpriseContacts, enterprisesInCity } from '@/lib/public/company';
import { getManufacturerPhoto } from '@/lib/public/photography';
import { insidePartnerHoverZones } from '@/lib/public/partnerHover';
import './EnterpriseMapPreview.css';

export function useEnterpriseMapPreview() {
  const mapRef = useRef(null);
  const cardRef = useRef(null);
  const anchorRef = useRef(null);
  const skipFocusRef = useRef(null);
  const timerRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [enterpriseId, setEnterpriseId] = useState(null);
  const id = useId();
  const cancelClose = useCallback(() => { window.clearTimeout(timerRef.current); timerRef.current = null; }, []);
  const close = useCallback(() => { cancelClose(); setPreview(null); }, [cancelClose]);

  const open = useCallback((city, anchor) => {
    if (!mapRef.current || !anchor) return;
    const items = enterprisesInCity(manufacturers, city);
    if (!items.length) return;
    cancelClose();
    anchorRef.current = anchor;
    const map = mapRef.current.getBoundingClientRect();
    const pin = anchor.getBoundingClientRect();
    const compact = window.innerWidth <= 760;
    const width = Math.min(compact ? 320 : 390, window.innerWidth - 32);
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
    setPreview({ city, map: { left: Math.max(0, map.left), top: Math.max(0, map.top), right: Math.min(window.innerWidth, map.right), bottom: Math.min(window.innerHeight, map.bottom) }, card: { left, top, width, maxHeight: height } });
    setEnterpriseId(items[0].id);
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
      if (event.pointerType !== 'mouse') return;
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
    const leaveWindow = event => { if (!event.relatedTarget) close(); };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerout', leaveWindow);
    window.addEventListener('keydown', escape);
    window.addEventListener('scroll', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      cancelClose();
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerout', leaveWindow);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', close);
      window.removeEventListener('resize', close);
    };
  }, [preview, close, cancelClose]);

  const items = preview ? enterprisesInCity(manufacturers, preview.city) : [];
  const active = items.find(item => item.id === enterpriseId) || items[0];
  const contact = active && enterpriseContacts[active.id];
  const photo = active && getManufacturerPhoto(active.id);
  const map = preview?.map;
  const previewLayer = preview && createPortal(<div className="enterprise-map-preview-layer">
    {/* Four independent panels leave the actual live map entirely uncovered. */}
    <div className="enterprise-map-shade" style={{ left: 0, top: 0, right: 0, height: map.top }} onClick={close} />
    <div className="enterprise-map-shade" style={{ left: 0, top: map.bottom, right: 0, bottom: 0 }} onClick={close} />
    <div className="enterprise-map-shade" style={{ left: 0, top: map.top, width: map.left, height: map.bottom - map.top }} onClick={close} />
    <div className="enterprise-map-shade" style={{ left: map.right, top: map.top, right: 0, height: map.bottom - map.top }} onClick={close} />
    <E as="aside" ref={cardRef} id={id} className="enterprise-map-preview" style={preview.card} aria-label="Справка о предприятии" onPointerEnter={cancelClose}>
      <div className="enterprise-map-preview-top"><E as="p" className="site-eyebrow">ПРЕДПРИЯТИЯ ГРУППЫ</E><E as="button" type="button" className="enterprise-map-preview-close" aria-label="Закрыть справку о предприятии" onClick={restoreFocus}>×</E></div>
      <E as="p" className="enterprise-map-preview-city">{preview.city}</E>
      {items.length > 1 && <E as="div" className="enterprise-map-choices" role="group" aria-label="Предприятия в городе">{items.map(item => <E as="button" key={item.id} type="button" aria-pressed={item.id === active.id} onClick={() => setEnterpriseId(item.id)}>{item.short}</E>)}</E>}
      <E as="h3">{active.title}</E>
      {photo && <E as="figure"><Image src={photo.path} alt={photo.caption} width={760} height={480} sizes="390px" /><E as="figcaption">{photo.caption}</E></E>}
      <E as="p" className="enterprise-map-preview-description">{active.description}</E>
      <E as="h4">Специализация</E><E as="ul">{active.capabilities.map(value => <E as="li" key={value}>{value}</E>)}</E>
      <div className="enterprise-map-preview-contact"><E as="p">{contact.label}</E><E as="address">{contact.city}, {contact.address}</E><E as="a" href={`tel:${contact.tel}`}>{contact.phone}{contact.extension ? ` · ${contact.extension}` : ''}</E><E as="a" href={`mailto:${contact.email}`}>{contact.email}</E></div>
      <Link href={`/manufacturers/${active.id}`} className="site-text-link">Профиль предприятия →</Link>
    </E>
  </div>, document.body);

  return { mapRef, open, focus, close, previewLayer, previewCity: preview?.city, previewId: preview ? id : undefined };
}
