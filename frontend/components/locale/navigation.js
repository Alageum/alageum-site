'use client';
import { usePathname as useNextPathname, useRouter as useNextRouter } from 'next/navigation';
import { useMemo } from 'react';
import { useLocale } from './LocaleProvider';
import { stripLocale, localizedHref } from '@/lib/i18n/routing';
export function usePathname() { return stripLocale(useNextPathname() || '/'); }
export function useRouter() { const router = useNextRouter(); const locale = useLocale(); return useMemo(() => ({ ...router, push: (href, options) => router.push(localizedHref(href, locale), options), replace: (href, options) => router.replace(localizedHref(href, locale), options), prefetch: (href, options) => router.prefetch(localizedHref(href, locale), options) }), [router, locale]); }
export { useSearchParams, useParams, redirect, notFound } from 'next/navigation';
