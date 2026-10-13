'use client';import LocaleElement from "@/components/locale/LocaleElement";

import Image from "@/components/locale/LocaleImage";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CorporateArrow from './CorporateArrow';
import { insidePartnerHoverZones } from '@/lib/public/partnerHover';
import { partnerProfiles, partners } from '@/lib/public/partners';

// Names, logos and destinations from the official Alageum partner section.
export { partners } from '@/lib/public/partners';


export default function PartnerMarquee() {
  const [active, setActive] = useState(null);
  const [paused, setPaused] = useState(false);
  const cardRef = useRef(null);
  const closeTimer = useRef(null);
  const sectionRef = useRef(null);
  const [inView, setInView] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const partner = partners.find((item) => item.id === active?.id);
  function cancelClose(){window.clearTimeout(closeTimer.current);closeTimer.current=null;}
  function close() {cancelClose();setActive(null);}
  useEffect(() => {
    if (!active) return;
    function move(event) {
      if (event.pointerType !== 'mouse') return;
      const inside = insidePartnerHoverZones({ x: event.clientX, y: event.clientY }, active.rect, cardRef.current?.getBoundingClientRect());
      if (inside) { window.clearTimeout(closeTimer.current); closeTimer.current = null; return; }
      if (!closeTimer.current) closeTimer.current = window.setTimeout(() => { closeTimer.current = null; setActive(null); }, 180);
    }
    function outside(event) {
      if (cardRef.current?.contains(event.target) || event.target.closest('.partner-logo')) return;
      window.clearTimeout(closeTimer.current); closeTimer.current = null; setActive(null);
    }
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerdown', outside);
    return () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerdown', outside); };
  }, [active]);
  useEffect(()=>()=>window.clearTimeout(closeTimer.current),[]);
  function open(item, element) {
    cancelClose();
    setPhotoIndex(0);
    const rect = element.getBoundingClientRect();
    const width = Math.min(420, window.innerWidth - 32);
    const right = rect.right + 14;
    const left = rect.left - width - 14;
    const beside = window.innerWidth > 760 && (right + width < window.innerWidth - 16 || left > 16);
    const cardLeft = beside ? right + width < window.innerWidth - 16 ? right : left : Math.max(16, Math.min(rect.left, window.innerWidth - width - 16));
    const cardTop = Math.max(16, Math.min(rect.top - 100, window.innerHeight - Math.min(680, window.innerHeight - 32) - 16));
    setActive({ id: item.id, rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height }, card: { left: cardLeft, top: cardTop, width, maxHeight: Math.min(680, window.innerHeight - cardTop - 16) } });
  }
  useEffect(() => {
    if (!active) return;
    const dismiss = () => {window.clearTimeout(closeTimer.current);closeTimer.current=null;setActive(null);};
    const escape = (event) => {if (event.key === 'Escape') {window.clearTimeout(closeTimer.current);closeTimer.current=null;setActive(null);document.activeElement?.blur();}};
    window.addEventListener('scroll', dismiss, { passive: true });
    window.addEventListener('resize', dismiss);
    window.addEventListener('keydown', escape);
    return () => {window.removeEventListener('scroll', dismiss);window.removeEventListener('resize', dismiss);window.removeEventListener('keydown', escape);};
  }, [active]);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { rootMargin: '100px' });
    if (sectionRef.current) observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);
  const profile = partner ? partnerProfiles[partner.id] : null;
  return <LocaleElement as="section" ref={sectionRef} className="partner-section" aria-labelledby="partner-heading">
    <LocaleElement as="div" className="site-container partner-heading"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">ПАРТНЁРЫ КОМПАНИИ</LocaleElement><LocaleElement as="h2" id="partner-heading">Вместе с лидерами отраслей.</LocaleElement></LocaleElement><LocaleElement as="button" type="button" className="partner-pause" aria-label={paused ? 'Продолжить движение логотипов' : 'Приостановить движение логотипов'} aria-pressed={paused} onClick={() => setPaused((value) => !value)}>{paused ? 'Продолжить →' : 'Пауза Ⅱ'}</LocaleElement></LocaleElement>
    <LocaleElement as="div" className={`partner-experience${paused || active || !inView ? ' is-paused' : ''}`}>
      <LocaleElement as="div" className="partner-window"><LocaleElement as="div" className="partner-track">{[0, 1].map((copy) => <LocaleElement as="div" className="partner-group" key={copy} aria-hidden={copy === 1 ? true : undefined}>{partners.map((item) => <LocaleElement as="button" type="button" key={item.id} className="partner-logo" tabIndex={copy === 1 ? -1 : 0} aria-label={`О партнёре ${item.name}`} aria-expanded={active?.id === item.id} aria-controls={active ? 'partner-detail' : undefined} onPointerEnter={(event) => {if (event.pointerType === 'mouse') open(item, event.currentTarget);}} onFocus={(event) => open(item, event.currentTarget)} onClick={(event) => open(item, event.currentTarget)}><Image src={`/partners/${item.id}.png`} alt={item.name} width={180} height={90} loading="eager" unoptimized /></LocaleElement>)}</LocaleElement>)}</LocaleElement></LocaleElement>
    </LocaleElement>
    {partner && createPortal(<LocaleElement as="div" className="partner-preview-layer">
      <LocaleElement as="div" className="partner-page-backdrop" aria-hidden="true" onClick={close} />
      <LocaleElement as="div" className="partner-spotlight" style={active.rect} aria-hidden="true"><Image src={`/partners/${partner.id}.png`} alt="" width={180} height={90} unoptimized /></LocaleElement>
      <LocaleElement as="aside" ref={cardRef} id="partner-detail" className="partner-detail" style={active.card} aria-label={`О компании ${partner.name}`} onBlur={(event) => {if (!event.currentTarget.contains(event.relatedTarget)) close();}}>
        <LocaleElement as="div" className="partner-detail-copy" key={partner.id}><LocaleElement as="span">{partner.sector}</LocaleElement><LocaleElement as="h3">{partner.name}</LocaleElement></LocaleElement>
        <LocaleElement as="figure" className="partner-gallery"><Image src={profile.gallery[photoIndex].src} alt={profile.gallery[photoIndex].caption} width={760} height={440} unoptimized /><LocaleElement as="figcaption">{profile.gallery[photoIndex].caption}</LocaleElement><LocaleElement as="div" className="partner-gallery-controls">{profile.gallery.map((photo, index) => <LocaleElement as="button" key={photo.src} type="button" aria-label={`Фото ${index + 1}: ${photo.caption}`} aria-pressed={photoIndex === index} onClick={() => setPhotoIndex(index)}><Image src={photo.src} alt="" width={64} height={40} unoptimized /></LocaleElement>)}<LocaleElement as="span">{photoIndex + 1} / {profile.gallery.length}</LocaleElement></LocaleElement></LocaleElement>
        <LocaleElement as="dl" className="partner-facts">{profile.year && <LocaleElement as="div"><LocaleElement as="dt">Основание</LocaleElement><LocaleElement as="dd">{profile.year}</LocaleElement></LocaleElement>}<LocaleElement as="div"><LocaleElement as="dt">География</LocaleElement><LocaleElement as="dd">{profile.geography}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">Направления</LocaleElement><LocaleElement as="dd">{profile.focus}</LocaleElement></LocaleElement></LocaleElement>
        <LocaleElement as="div" className="partner-article">{profile.paragraphs.map((text) => <LocaleElement as="p" key={text}>{text}</LocaleElement>)}</LocaleElement>
        <LocaleElement as="div" className="partner-sources"><LocaleElement as="a" href={`/partners/${partner.id}`}>Подробнее о компании <CorporateArrow /></LocaleElement><LocaleElement as="span">Название и логотип принадлежат правообладателю.</LocaleElement></LocaleElement>
        <LocaleElement as="button" type="button" className="partner-close" onClick={(event) => {close();event.currentTarget.blur();}} aria-label="Закрыть карточку партнёра">×</LocaleElement>
      </LocaleElement>
    </LocaleElement>, document.body)}
  </LocaleElement>;
}
