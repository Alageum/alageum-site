import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporatePhoto from '../CorporatePhoto';
import CorporateArrow from '../CorporateArrow';
import '@/app/company-pages.css';
import './story.css';
import './visual.css';
import './corporate-story.css';
import StoryMotion from './StoryMotion';
import {localResourceHref,localSourceHref} from '@/lib/public/localResources';

export function Story({ children, name = '' }) {
  const theme = name.startsWith('catalog-') ? '' : ' story-corporate';
  return <StoryMotion className={`public-story story-${name}${theme}`}>{children}</StoryMotion>;
}
export function Hero({ label, kicker = label, title, lead, photo, children, variant = 'split', parent, visual, ancestors = [] }) {
  return <E as="header" className={`story-hero story-hero-${variant}`}>
    <div className="story-hero-copy"><E as="nav" className="story-breadcrumb" aria-label="Хлебные крошки"><Link href="/">Alageum</Link><span aria-hidden="true">/</span>{ancestors.map(item=><span className="story-ancestor" key={item.href}><Link href={item.href}>{item.label}</Link><span aria-hidden="true">/</span></span>)}{parent && <><Link href={parent.href}>{parent.label}</Link><span aria-hidden="true">/</span></>}<E aria-current="page">{label}</E></E>
      {kicker && <E as="p" className="story-kicker">{kicker}</E>}<E as="h1">{title}</E>{lead && <E as="p" className="story-lead">{lead}</E>}{children}
    </div>{photo && <CorporatePhoto photo={photo} priority className="story-hero-photo" sizes="(max-width: 800px) 100vw, 55vw" />}
  {visual && <div className="story-hero-visual">{visual}</div>}</E>;
}
export function Section({ label, title, children, id, tone = '', className = '' }) {
  return <E as="section" id={id} className={`story-section ${tone ? `story-tone-${tone}` : ''} ${className}`}>{(label || title) && <div className="story-section-heading">{label && <E as="p" className="story-kicker">{label}</E>}{title && <E as="h2">{title}</E>}</div>}{children}</E>;
}
export function Jump({ href, children }) {
  href=localResourceHref(href);
  if(href===null)return null;
  const external = /^https?:/.test(href) && !/\.pdf(?:#|$)/i.test(href);
  return external ? <a href={href} className="story-jump" target="_blank" rel="noopener noreferrer"><E>{children}</E><CorporateArrow /></a> : <Link href={href} className="story-jump">{children}<CorporateArrow /></Link>;
}
export function Source({ href, children = 'Источник', period }) {
  href=localSourceHref(href);
  if(href===null)return period?<E as="p" className="story-source">{period}</E>:null;
  const external=/^https?:/.test(href);
  return <E as="p" className="story-source"><Link href={href} {...(external?{target:'_blank',rel:'noopener noreferrer'}:{})}>{children} ↗</Link>{period && <E as="span">{period}</E>}</E>;
}
export function ChapterNav({ items }) {
  return <E as="nav" className="story-chapter-nav" aria-label="На этой странице">{items.map(([href,label])=><Link key={href} href={href}>{label}<span aria-hidden="true">↓</span></Link>)}</E>;
}
export function ReadingLinks({ items }) {return <div className="story-reading-links">{items.map(([original,title,text])=>{const href=localResourceHref(original);if(href===null)return null;const external=/^https?:/.test(href);return <Link key={href} href={href} {...(external?{target:'_blank',rel:'noopener noreferrer'}:{})}><E as="h3">{title}</E><E as="p">{text}</E><CorporateArrow /></Link>;})}</div>;}
