import { notFound } from 'next/navigation';
export default async function LocaleLayout({ params, children }) { const { locale } = await params; if (!['ru','kk','en'].includes(locale)) notFound(); return children; }
