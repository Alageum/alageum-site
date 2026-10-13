'use client';
import DesignSelect from '@/components/ui/DesignSelect';
import { useLocale } from './LocaleProvider';
import { usePathname, useSearchParams } from 'next/navigation';
import { localizedHref, stripLocale } from '@/lib/i18n/routing';
import { Suspense } from 'react';
export function ecosystemArea(path) { path = stripLocale(path); return path.startsWith('/careers') ? 'careers' : ['/catalog','/client','/b2b','/selection','/inquiry','/login'].some(root => path === root || path.startsWith(`${root}/`)) ? 'catalog' : 'company'; }
function Navigation() {
  const pathname = usePathname() || '/'; const params = useSearchParams(); const locale = useLocale();
  const labels = { ru: ['Компания','Каталог','Карьера','Язык сайта','Сайты Alageum Electric'], kk: ['Компания','Каталог','Мансап','Сайт тілі','Alageum Electric сайттары'], en: ['Company','Products','Careers','Site language','Alageum Electric websites'] }[locale];
  function switchLanguage(event) { const query = params.toString(); window.location.assign(localizedHref(stripLocale(pathname), event.target.value) + (query ? `?${query}` : '') + window.location.hash); }
  return <label className="ecosystem-language"><span className="sr-only">{labels[3]}</span><DesignSelect value={locale} onChange={switchLanguage} aria-label={labels[3]}><option value="ru">RU</option><option value="kk">KZ</option><option value="en">EN</option></DesignSelect></label>;
}
export default function LanguageSwitcher() { return <Suspense fallback={null}><Navigation /></Suspense>; }
