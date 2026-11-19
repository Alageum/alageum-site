import LocaleElement from "@/components/locale/LocaleElement";import CorporateArrow from '@/components/public/CorporateArrow';
import CorporatePhoto from './CorporatePhoto';
import {getManufacturerPhoto} from '@/lib/public/photography';
import {storyPhotos} from '@/lib/public/story-photography';
import {getProjectPhoto} from '@/lib/public/photography';
import Link from "@/components/locale/LocaleLink";
import { activityDirections } from '@/lib/public/activity-directions';
import { projectStages } from '@/lib/public/company';
import {localSourceHref} from '@/lib/public/localResources';
import SectionEyebrow from './SectionEyebrow';

export function SectionHeading({ number, label, title, href, link, newTab = false }) {
  return <LocaleElement as="div" className="corp-section-heading"><LocaleElement as="div">{label && <SectionEyebrow number={number} label={label} />}<LocaleElement as="h2">{title}</LocaleElement></LocaleElement>{href && <Link className="site-text-link" href={href} target={newTab ? "_blank" : undefined} rel={newTab ? "noopener noreferrer" : undefined}>{link} <CorporateArrow /></Link>}</LocaleElement>;
}
const stagePhotos = { '01': storyPhotos.asiaEngineering, '02': getManufacturerPhoto('aemz'), '03': getProjectPhoto('petropavlovsk'), '04': storyPhotos.ktzProducts };
export function ProjectStages() {
  return (
    <ul className="corp-stages activity-stages">
      {activityDirections.map(({ id, title, stage: stageIndex }) => {
        const stage = projectStages[stageIndex];
        const photo = stage && stagePhotos[stage.number];
        return (
          <li key={id}>
            {photo && (
              <>
                <div className="corp-project-visual">
                  <CorporatePhoto photo={photo} caption={false} sizes="(max-width:760px) 100vw,25vw" />
                </div>
                <LocaleElement as="small" className="site-metadata">{photo.caption}</LocaleElement>
              </>
            )}
            <LocaleElement as="h3">{title}</LocaleElement>
            {stage && <LocaleElement as="p">{stage.text}</LocaleElement>}
            {stage?.period && <Link href={localSourceHref(stage.source)} className="site-metadata">{stage.period}</Link>}
            <Link href={stage?.href || `/directions#${id}`} aria-label={title} className="corp-stage-link"><CorporateArrow /></Link>
          </li>
        );
      })}
    </ul>
  );
}
export function CorporateCTA({ title = 'Нужно подобрать оборудование?', text = 'Позвоните в отдел продаж или напишите, что нужно для вашего объекта.' }) {
  return <LocaleElement as="section" className="corp-cta"><LocaleElement as="div"><LocaleElement as="p" className="site-eyebrow">СОТРУДНИЧЕСТВО</LocaleElement><LocaleElement as="h2">{title}</LocaleElement><LocaleElement as="p">{text}</LocaleElement></LocaleElement><LocaleElement as="div" className="corp-cta-actions"><Link className="site-button site-button-primary" href="/contacts">Связаться с нами <CorporateArrow /></Link><Link className="site-text-link" href="/documents">Материалы о группе <CorporateArrow direction="right" /></Link></LocaleElement></LocaleElement>;
}
