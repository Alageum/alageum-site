import { notFound } from 'next/navigation';
import { locales } from '@/lib/i18n/routing';
export default async function LocaleLayout({ params, children }) { const { locale } = await params; if (!locales.includes(locale)) notFound(); return children; }
