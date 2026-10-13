import LocaleElement from "@/components/locale/LocaleElement";export default function ProjectGraphic({ project }) {
  return <LocaleElement as="div" className={`project-graphic project-graphic-${project.kind}`}>
    <svg viewBox="0 0 600 340" fill="none" aria-hidden="true">
      <path d="M0 60h600M0 140h600M0 220h600M0 300h600M60 0v340M140 0v340M220 0v340M300 0v340M380 0v340M460 0v340M540 0v340" stroke="currentColor" opacity=".08" />
      <path d="M300 64v62h94v48h104M300 126H202v48H100M300 126v116h90v50M300 242h-88v50" stroke="currentColor" strokeWidth="2" opacity=".3" />
      <circle cx="300" cy="64" r="8" fill="currentColor" opacity=".35" /><circle cx="100" cy="174" r="8" fill="currentColor" opacity=".35" /><circle cx="498" cy="174" r="8" fill="currentColor" opacity=".35" />
      <circle cx="300" cy="126" r="12" fill="#ce1727" /><circle cx="390" cy="292" r="8" stroke="currentColor" opacity=".35" /><circle cx="212" cy="292" r="8" stroke="currentColor" opacity=".35" />
    </svg>
    <LocaleElement as="div"><LocaleElement as="span" className="site-eyebrow">ALAGEUM / {project.location}</LocaleElement><LocaleElement as="strong">{project.metric}</LocaleElement><LocaleElement as="span">{project.metricLabel}</LocaleElement></LocaleElement>
    <LocaleElement as="small">Схематическая иллюстрация</LocaleElement>
  </LocaleElement>;
}
