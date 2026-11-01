import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import {companyNavigation} from '@/lib/public/company-architecture';
import './company-architecture.css';
export default function CompanyNavigation({active}){return <E as="nav" className="company-local-nav" aria-label="Раздел «Компания»"><div className="company-local-nav-rail">{companyNavigation.map(([label,href])=><Link key={href} href={href} aria-current={href===active?'page':undefined}>{label}</Link>)}</div></E>;}
