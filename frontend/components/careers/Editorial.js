import {localSourceHref} from '@/lib/public/localResources';
import L from "@/components/careers/Text";
import Image from "./CareerImage";
import CorporateArrow from "@/components/public/CorporateArrow";

export function Photo({ id, caption, priority = false, className = "" }) {
  return (
    <figure className={`corp-photo ${className}`}>
      <Image
        src={`/photography/manufacturers/${id}.webp`}
        alt={caption}
        width={1000}
        height={600}
        sizes="(max-width: 760px) 100vw, 60vw"
        preload={priority}
      />
      <L as="figcaption">{caption}</L>
    </figure>
  );
}
export function Intro({ label, title, children }) {
  return (
    <header className="site-container career-intro">
      <div className="site-page-heading">
        <L as="p" className="site-eyebrow">
          ALAGEUM ELECTRIC / {label}
        </L>
        <L as="h1">{title}</L>
        {children && <L as="p">{children}</L>}
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
  return (
    <p className="corp-small-note career-source">
      <L as="a" href={localSourceHref(href)} target="_blank" rel="noreferrer">
        {children}
        <CorporateArrow />
      </L>
      {publishedAt ? (
        <span>
          <L>Дата публикации:</L> {publishedAt}. <L>Проверено 01.11.2026.</L>
        </span>
      ) : (
        <L>Проверено 01.11.2026. Дата публикации не указана.</L>
      )}
    </p>
  );
}
