import 'server-only';
import { editorialMetadata } from '../public/pages.js';

// Used only by /company and the exact RU about alias. Never validate at import
// time or in the common Page loader: unrelated published pages are independent.
export function companyDelivery(env = process.env) {
  const source = env.COMPANY_SOURCE;
  if (source === undefined || source === 'static') return { source: 'static' };
  if (source !== 'cms') throw new Error('COMPANY_SOURCE must be static or cms');
  if (env.PAGES_SOURCE !== undefined && env.PAGES_SOURCE !== 'api') throw new Error('CMS company requires PAGES_SOURCE=api or unset');
  if (env.PAGES_STATIC_PREVIEW === '1') throw new Error('CMS company cannot use disposable static preview');
  if (typeof env.PAGES_SITE_ORIGIN !== 'string' || !env.PAGES_SITE_ORIGIN) throw new Error('CMS company requires an explicit PAGES_SITE_ORIGIN');
  // Apply the generic origin validation before any content can start streaming.
  const validated = editorialMetadata({ locale_code: 'ru', slug: 'about', title: '' }, env.PAGES_SITE_ORIGIN);
  return { source: 'cms', canonical: new URL('/company', validated.alternates.canonical).href };
}

export function companyMetadata(page, config) {
  return { ...editorialMetadata(page), alternates: { canonical: config.canonical } };
}
