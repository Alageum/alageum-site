'use client';import LocaleElement from "@/components/locale/LocaleElement";

import { useState } from 'react';
import Link from "@/components/locale/LocaleLink";
import CorporateArrow from './CorporateArrow';
import CorporatePhoto from './CorporatePhoto';
import ProjectGraphic from './ProjectGraphic';
import { projects } from '@/lib/public/content';
import { getProjectPhoto } from '@/lib/public/photography';
import { projectTypes, projectTypeLabel } from '@/lib/public/project-cases';

export default function ProjectPortfolio() {
  const [kind, setKind] = useState('all');
  const visible = projects.filter((project) => kind === 'all' || project.kind === kind);
  return <LocaleElement as="section" className="project-portfolio" aria-labelledby="project-portfolio-title">
    <LocaleElement as="div" className="project-portfolio-heading"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">ПРОЕКТЫ И КОМПЕТЕНЦИИ</LocaleElement><LocaleElement as="h2" id="project-portfolio-title">Разные задачи.<br />Один инженерный подход.</LocaleElement></LocaleElement><LocaleElement as="p" role="status" aria-live="polite">Кейсов в подборке: {visible.length}</LocaleElement></LocaleElement>
    <LocaleElement as="div" className="project-filters" role="group" aria-label="Вид работ">{projectTypes.map((type) => <LocaleElement as="button" key={type.id} type="button" aria-pressed={kind === type.id} onClick={() => setKind(type.id)}>{type.label}<LocaleElement as="span">{type.id === 'all' ? projects.length : projects.filter((project) => project.kind === type.id).length}</LocaleElement></LocaleElement>)}</LocaleElement>
    <LocaleElement as="div" className="public-grid two project-case-grid">{visible.map((project) => <LocaleElement as="article" className="public-card corp-project-card" key={project.id} data-project-case={project.id}>
      <Link className="project-case-visual" href={`/projects/${project.id}`} aria-label={`Кейс: ${project.title}`}>
        {getProjectPhoto(project.id) ? <CorporatePhoto photo={getProjectPhoto(project.id)} caption={false} sizes="(max-width: 760px) 100vw, 50vw" /> : <ProjectGraphic project={project} />}
        <LocaleElement as="span" className="project-case-kind">{projectTypeLabel(project.kind)}</LocaleElement>
      </Link>
      <LocaleElement as="div" className="corp-project-card-body"><LocaleElement as="div" className="project-case-meta"><LocaleElement as="span">{project.location}</LocaleElement><LocaleElement as="span">{project.period}</LocaleElement></LocaleElement><LocaleElement as="h2"><Link href={`/projects/${project.id}`}>{project.title}</Link></LocaleElement><LocaleElement as="p">{project.description}</LocaleElement><LocaleElement as="dl" className="project-case-scope"><LocaleElement as="div"><LocaleElement as="dt">Участие</LocaleElement><LocaleElement as="dd">{project.role}</LocaleElement></LocaleElement><LocaleElement as="div"><LocaleElement as="dt">{project.metricLabel}</LocaleElement><LocaleElement as="dd">{project.metric}</LocaleElement></LocaleElement></LocaleElement><Link className="site-text-link" href={`/projects/${project.id}`}>Посмотреть кейс <CorporateArrow /></Link></LocaleElement>
    </LocaleElement>)}</LocaleElement>
  </LocaleElement>;
}
