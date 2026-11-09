import {localSourceHref} from '@/lib/public/localResources';
import L from "@/components/careers/Text";
import Image from "./CareerImage";
import CorporateArrow from "@/components/public/CorporateArrow";

export function Photo({ id, photo, caption = photo?.caption, priority = false, className = "" }) {
  return (
    <figure className={`corp-photo ${className}`}>
      <Image
        src={photo?.path || `/photography/manufacturers/${id}.webp`}
        alt={photo?.alt || caption}
        width={photo?.width || 1000}
        height={photo?.height || 600}
        sizes="(max-width: 760px) 100vw, 60vw"
        preload={priority}
      />
      <L as="figcaption">{caption}</L>
    </figure>
  );
}
export function Intro({ label, title, children, actions, back }) {
  return (
    <header className="site-container career-intro">
      <div className="site-page-heading">
        {back}
        <L as="p" className="site-eyebrow">
          ALAGEUM ELECTRIC / {label}
        </L>
        <L as="h1">{title}</L>
        {children && <L as="p">{children}</L>}
        {actions && <div className="site-actions career-intro-actions">{actions}</div>}
      </div>
    </header>
  );
}
export function Action({ href, children }) {
  return (
    <L as="a" className="site-button site-button-primary" href={href}>
      {children}
      <CorporateArrow />
    </L>
  );
}
export function Source({ href, children, publishedAt }) {
  const target = localSourceHref(href);
  if (!target) return null;
  const external = /^https?:/.test(target);
  return (
    <p className="corp-small-note career-source">
      <L as="a" href={target} target={external ? '_blank' : undefined} rel={external ? 'noopener noreferrer' : undefined}>
        {children}
        <CorporateArrow />
      </L>
      {publishedAt && <time dateTime={publishedAt.split('.').reverse().join('-')}>{publishedAt}</time>}
    </p>
  );
}
