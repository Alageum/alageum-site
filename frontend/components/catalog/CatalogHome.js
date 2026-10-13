'use client';
import { useMemo, useState } from 'react';
import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import Image from '@/components/locale/LocaleImage';
import { useRouter } from '@/components/locale/navigation';
import { useTranslate } from '@/components/locale/LocaleProvider';
import { categories, officialProducts } from '@/lib/catalog/data';
import { filterProducts } from '@/lib/catalog/query';
import { displayProductName } from '@/lib/catalog/presentation';
import { getProductPhotograph } from '@/lib/catalog/photography';
import ProductIcon from './ProductIcon';
import { useSelection } from './SelectionProvider';
import './CatalogHome.css';
const shortcuts = ['ТМГ-630','Сухие трансформаторы','КТП','10 кВ'];
const featured = ['transformers','substations','switchgear','cabinets'].map(category => officialProducts.find(p => p.category === category && getProductPhotograph(p)) || officialProducts.find(p => p.category === category)).filter(Boolean);
export default function CatalogHome() {
  const [query,setQuery]=useState(''); const [focused,setFocused]=useState(false); const [added,setAdded]=useState('');
  const router=useRouter(); const tx=useTranslate(); const selection=useSelection();
  const matches=useMemo(()=>query.trim()?filterProducts(officialProducts,{q:query}).slice(0,5):[],[query]);
  function search(event){event.preventDefault();router.push(`/catalog${query.trim()?`?q=${encodeURIComponent(query.trim())}`:''}`);}
  return <E as="div" className="parts-home"><div className="parts-container">
    <E as="section" className="parts-search-zone" aria-label="Поиск оборудования"><div><E as="span" className="parts-kicker">ALAGEUM / КАТАЛОГ ОБОРУДОВАНИЯ</E><E as="h1">Найдите оборудование для вашего проекта.</E></div>
      <div className="parts-search-wrap" onFocus={()=>setFocused(true)} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setFocused(false);}}><form className="parts-search" onSubmit={search}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/></svg><E as="input" aria-label="Поиск по обозначению или параметрам" placeholder="Обозначение, тип оборудования или параметры" value={query} onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Escape')setFocused(false);}} autoComplete="off"/><E as="button" type="submit">Найти</E></form>
      {focused&&query.trim()&&<div className="parts-suggestions">{matches.map(product=><Link key={product.id} href={`/catalog/${product.id}`}><span data-no-translate>{displayProductName(product)}</span><E as="span">Характеристики ↗</E></Link>)}<Link href={`/catalog?q=${encodeURIComponent(query.trim())}`}>{matches.length?tx('Все результаты поиска →'):tx('Открыть поиск с фильтрами →')}</Link></div>}</div>
      <div className="parts-quick"><E as="span">Быстрый поиск:</E>{shortcuts.map(text=><Link key={text} href={`/catalog?q=${encodeURIComponent(text)}`}>{text}</Link>)}</div>
    </E>
    <div className="parts-top-grid"><E as="aside" className="parts-category-menu"><E as="h2">Категории оборудования</E><nav aria-label={tx('Категории оборудования')}>{categories.map(category=><Link key={category.id} href={`/catalog?category=${category.id}`}><E as="span">{category.short}</E><small>{officialProducts.filter(p=>p.category===category.id).length}</small><span aria-hidden="true">›</span></Link>)}</nav><Link className="parts-all" href="/catalog">Весь каталог <span aria-hidden="true">↗</span></Link></E>
      <E as="section" className="parts-banner"><div className="parts-banner-copy"><E as="span" className="parts-kicker">ПРОМЫШЛЕННОСТЬ. ИНФРАСТРУКТУРА. ЭНЕРГЕТИКА.</E><E as="h2">От технического выбора<br/>к готовому решению.</E><E as="p">Трансформаторы, подстанции и распределительное оборудование. Параметры, исполнения и документы в одном каталоге.</E><Link href="/catalog" className="parts-primary">Подобрать оборудование <span aria-hidden="true">↗</span></Link><div className="parts-banner-facts"><strong>{officialProducts.length}<E as="span">позиций каталога</E></strong><strong>{categories.length}<E as="span">категорий оборудования</E></strong></div></div><div className="parts-banner-photo"><Image src="/photography/equipment/category-transformers.webp" alt="Трансформаторы" width={800} height={600} priority sizes="(max-width: 760px) 90vw, 40vw"/><E as="span">ПРОИЗВОДСТВО ALAGEUM ELECTRIC</E></div></E>
    </div>
    <div className="parts-tools">{[['01','Проект и оборудование','Сохраните задачу и выбранные позиции.','/client/projects','Создать проект'],['02','Запрос коммерческого предложения','Подготовьте исходные данные для производителя.','/inquiry','Подготовить запрос'],['03','Документы и поддержка','Технические материалы и помощь с подбором.','/documents','Публичные документы']].map(([number,title,text,href,label])=><Link key={number} className="parts-tool" href={href}><span className="parts-tool-number">{number}</span><div><E as="h3">{title}</E><E as="p">{text}</E><E as="span" className="parts-tool-label">{label} ↗</E></div></Link>)}</div>
    <E as="section" className="parts-featured"><div className="parts-section-heading"><div><E as="span" className="parts-kicker">ТЕХНИЧЕСКИЙ ВЫБОР</E><E as="h2">Обзор оборудования</E></div><Link href="/catalog">Весь каталог ↗</Link></div><div className="parts-product-grid">{featured.map(product=>{const photo=getProductPhotograph(product);return <E as="article" key={product.id} className="parts-product"><Link href={`/catalog/${product.id}`} className="parts-product-image">{photo?<Image src={photo.path} alt={photo.alt} width={300} height={220} sizes="(max-width: 760px) 45vw, 24vw"/>:<ProductIcon product={product} size={160}/>}</Link><E as="span" className="parts-product-category">{categories.find(c=>c.id===product.category)?.short}</E><Link className="parts-product-title" href={`/catalog/${product.id}`}>{displayProductName(product)}</Link><E as="p">Исполнение и стоимость — по запросу.</E><div className="parts-product-actions"><Link href={`/catalog/${product.id}`}>Характеристики</Link><E as="button" type="button" onClick={()=>{selection.add(product.id);setAdded(product.id);}} aria-label={`${tx('В подборку')} ${displayProductName(product)}`}>{added===product.id?'Добавлено':'В подборку'} <span aria-hidden="true">+</span></E></div></E>;})}</div><E as="p" className="parts-note">Цена, наличие и исполнение подтверждаются производителем.</E><span className="sr-only" role="status">{added?tx('Оборудование добавлено в подборку'):''}</span></E>
    <E as="section" className="parts-project-strip"><div><E as="span" className="parts-kicker">ВАШ СЛЕДУЮЩИЙ ШАГ</E><E as="h2">Соберите оборудование в один проект.</E><E as="p">Сохраните подборку, подготовьте спецификацию и запрос коммерческого предложения.</E></div><Link href="/client/projects" className="parts-primary">Создать проект ↗</Link></E>
  </div></E>;
}
