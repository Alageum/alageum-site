import { cache } from 'react';
import { notFound } from 'next/navigation';
import EditorialPage from '@/components/public/EditorialPage';
import { loadEditorialPage } from '@/lib/api/pagesServer';
import { editorialMetadata } from '@/lib/public/pages';
import { companyDelivery, companyMetadata } from '@/lib/api/companyServer';
import '../../editorial-pages.css';

// Request-local memoization shares metadata/render reads without storing page
// content across requests. This route has no ancestral loading/Suspense shell.
const getPage = cache(async (locale, slug) => {
  const company = locale === 'ru' && slug === 'about' ? companyDelivery() : null;
  const page = await loadEditorialPage(locale, slug);
  if (!page) notFound();
  const metadata = company?.source === 'cms' ? companyMetadata(page, company) : editorialMetadata(page, process.env.PAGES_SITE_ORIGIN);
  return { page, metadata };
});

export async function generateMetadata({ params }) {
  const { locale, slug } = await params;
  return (await getPage(locale, slug)).metadata;
}

export default async function Page({ params }) {
  const { locale, slug } = await params;
  return <EditorialPage page={(await getPage(locale, slug)).page} />;
}
