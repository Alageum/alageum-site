import { cache } from 'react';
import { notFound } from 'next/navigation';
import StaticCompanyPage, { metadata as staticMetadata } from '@/components/public/StaticCompanyPage';
import EditorialPage from '@/components/public/EditorialPage';
import { loadEditorialPage } from '@/lib/api/pagesServer';
import { companyDelivery, companyMetadata } from '@/lib/api/companyServer';
import '../pages/editorial-pages.css';

// Source selection must happen at request time, including default static builds.
export const dynamic = 'force-dynamic';

// Both consumers await the same content AND validated metadata before rendering.
// This route deliberately lives outside the site's loading/Suspense boundary.
const getCompany = cache(async () => {
  const config = companyDelivery();
  if (config.source === 'static') return { source: 'static', page: null, metadata: staticMetadata };
  const page = await loadEditorialPage('ru', 'about');
  if (!page) notFound();
  return { source: 'cms', page, metadata: companyMetadata(page, config) };
});

export async function generateMetadata() {
  return (await getCompany()).metadata;
}

export default async function CompanyPage() {
  const resolved = await getCompany();
  return resolved.source === 'static' ? <StaticCompanyPage /> : <EditorialPage page={resolved.page} />;
}
