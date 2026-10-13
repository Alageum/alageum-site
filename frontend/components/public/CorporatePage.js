import LocaleElement from "@/components/locale/LocaleElement";import '../../app/company-pages.css';
import '../../app/investor-pages.css';

// Only corporate routes opt in. Engineering pages keep their existing shell.
export default function CorporatePage({ children, className = '', wide = false }) {
  return <LocaleElement as="div" className={`corp-page corp-investor ${className}`}>
    {wide ? children : <LocaleElement as="div" className="site-container site-info-page corp-page-content">{children}</LocaleElement>}
  </LocaleElement>;
}
