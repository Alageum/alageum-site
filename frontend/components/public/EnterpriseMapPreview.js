"use client";

import E from '@/components/locale/LocaleElement';
import Image from '@/components/locale/LocaleImage';
import Link from '@/components/locale/LocaleLink';
import { mapContacts } from '@/lib/public/enterprise-map-locations';
import { getManufacturerPhoto } from '@/lib/public/photography';
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
  const contact = item.contact || mapContacts[item.id];
  return <div className="enterprise-map-preview-details">
    <E as="p" className="enterprise-map-kind">{item.kind === 'office' ? 'Офис продаж' : 'Предприятие'}</E>
    <h3>
      {item.href && item.kind !== 'office'
        ? <Link href={item.href} className="enterprise-profile-title">{item.title}</Link>
        : <E>{item.title}</E>}
    </h3>
    {photo && <E as="figure"><Image src={photo.path} alt={photo.caption} width={760} height={480} sizes="390px" /><E as="figcaption">{photo.caption}</E></E>}
    <E as="p" className="enterprise-map-preview-description">{item.description}</E>
    {item.capabilities.length > 0 && <><E as="h4">Специализация</E><E as="ul">{item.capabilities.map(value => <E as="li" key={value}>{value}</E>)}</E></>}
    <div className="enterprise-map-preview-contact"><E as="p">{contact.label}</E><E as="address">{contact.city}{contact.address ? `, ${contact.address}` : ''}</E>{contact.tel && <E as="a" href={`tel:${contact.tel}`}>{contact.phone}{contact.extension ? ` · ${contact.extension}` : ''}</E>}{contact.email && <E as="a" href={`mailto:${contact.email}`}>{contact.email}</E>}</div>
    <LocationSources item={item} />
    {item.addressSource && <E as="p" className="enterprise-map-kind">Адрес по открытому источнику; точка обозначает город.</E>}
    {item.href && item.kind === 'office' && (
      <Link href={item.href} className="site-text-link" target="_blank" rel="noopener noreferrer">Открыть в 2ГИС ↗</Link>
    )}
  </div>;
}

export default function EnterpriseMapDetails({ items, activeId, onSelect, categoryTitle, areaTitle }) {
  const active = items.find(item => item.id === activeId) || items[0];
  if (!active) return null;
  return <div className="enterprise-map-preview-layer is-pinned is-multi">
    <E as="aside" className="enterprise-map-preview" aria-label="Справка о предприятии" id="enterprise-directory-details">
      <div className="enterprise-map-split">
        <div className="enterprise-map-picker-window">
          <E as="p" className="site-eyebrow enterprise-map-preview-label">{categoryTitle}</E>
          <E as="p" className="enterprise-map-preview-city">{areaTitle}</E>
          <E as="p" className="enterprise-region-count" role="status">Объектов: {items.length}</E>
          <E as="div" className="enterprise-map-choices" role="group" aria-label="Выберите предприятие или офис">
            {items.map(item => <E as="button" className="enterprise-map-choice" key={item.id} type="button" aria-pressed={item.id === active.id} aria-controls="enterprise-directory-active-details" onClick={() => onSelect(item.id)}>
              <span className="enterprise-map-choice-image" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg></span>
              <span className="enterprise-map-choice-name"><E as="strong">{item.short || item.title}</E><E as="small">{item.contact.city}</E></span>
            </E>)}
          </E>
        </div>
        <div className="enterprise-map-detail-pane" id="enterprise-directory-active-details" key={active.id}>
          <LocationDetails item={active} photo={getManufacturerPhoto(active.id)} />
        </div>
      </div>
    </E>
  </div>;
}
