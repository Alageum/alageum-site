import LocaleElement from "@/components/locale/LocaleElement";import CorporatePhoto from '@/components/public/CorporatePhoto';
import { getManufacturerPhoto } from '@/lib/public/photography';

export default function ProductionFeature({ label = 'ПРОИЗВОДСТВО / ASIA TRAFO', title, text }) {
  return <LocaleElement as="section" className="brand-production-feature">
    <CorporatePhoto photo={getManufacturerPhoto('asia-trafo')} className="brand-production-photo" sizes="(max-width: 760px) 100vw, 65vw" />
    <LocaleElement as="div" className="brand-production-copy"><LocaleElement as="p" className="site-eyebrow">{label}</LocaleElement><LocaleElement as="h2">{title}</LocaleElement><LocaleElement as="p">{text}</LocaleElement></LocaleElement>
  </LocaleElement>;
}
