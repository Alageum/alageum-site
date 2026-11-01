'use client';
import {useState} from 'react';
import E from '@/components/locale/LocaleElement';
import CorporatePhoto from '../CorporatePhoto';
import {companyHistory} from '@/lib/public/company';
import {storyPhotos} from '@/lib/public/story-photography';
import {getManufacturerPhoto} from '@/lib/public/photography';
const photos=[storyPhotos.history,getManufacturerPhoto('aemz'),storyPhotos.ktzProducts,getManufacturerPhoto('petz')];
export default function HistoryExplorer(){const [active,setActive]=useState(0);return <div className="visual-history"><E as="nav" aria-label="Годы развития" className="history-years">{companyHistory.map((item,i)=><button type="button" key={item.year} aria-pressed={i===active} aria-controls="history-selected" onClick={()=>setActive(i)}>{item.year}<span aria-hidden="true">↗</span></button>)}</E><div id="history-selected" className="history-selected"><CorporatePhoto photo={photos[active]} sizes="(max-width:760px) 100vw,65vw"/><div className="history-event" aria-live="polite"><span className="history-event-year">{companyHistory[active].year}</span><E as="h2">{companyHistory[active].title}</E><E as="p">{companyHistory[active].text}</E><a href={companyHistory[active].source} target="_blank" rel="noopener noreferrer"><E>Официальный источник</E> ↗</a></div></div><E as="p" className="story-note">Фотографии показывают архив или соответствующее предприятие. Кадры не датируются годом выбранного события.</E></div>;}
