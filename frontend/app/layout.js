import { headers, cookies } from 'next/headers';
import { localizeMetadata } from '@/lib/i18n/server';
import { LocaleProvider } from '@/components/locale/LocaleProvider';
import './globals.css';
import './site-shell.css';
import './catalog.css';
import './public-pages.css';
import './quote-print.css';
import './brand-experience.css';
import './brand-motion.css';
import './project-cases.css';
import './partner-marquee.css';
import './brand-details.css';
import './ecosystem.css';
import './design-system.css';
import { QUOTE_PRINT_FALLBACK } from '@/lib/quotes/print';
import { AuthProvider } from '@/components/AuthProvider';
import { ApiSelectionProvider } from '@/components/catalog/ApiSelectionProvider';
import { SelectionProvider } from '@/components/catalog/SelectionProvider';
import ExperienceShell from '@/components/ExperienceShell';

const baseMetadata = { title: { default: 'ALAGEUM Electric — компания, продукция, карьера', template: '%s · ALAGEUM Electric' }, description: 'Электротехническое оборудование ALAGEUM Electric: каталог, предприятия, решения и подготовка запроса.', robots: { index: false, follow: false } };
export async function generateMetadata({ params }) { return localizeMetadata(baseMetadata, (await params)?.locale || 'ru'); }
export default async function RootLayout({ children }) {
  const locale = (await headers()).get('x-alageum-locale') || (await cookies()).get('alageum-locale')?.value || 'ru';
  return <html lang={locale} data-scroll-behavior="smooth"><body><LocaleProvider locale={locale}><AuthProvider><ApiSelectionProvider><SelectionProvider><ExperienceShell>{children}</ExperienceShell></SelectionProvider></ApiSelectionProvider></AuthProvider></LocaleProvider><p data-quote-native-print-fallback="">{QUOTE_PRINT_FALLBACK}</p></body></html>;
}
