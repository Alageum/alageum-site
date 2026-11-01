'use client';
import Link from 'next/link';
import { localResourceHref } from '@/lib/public/localResources';
import { Children } from 'react';
import { useLocale } from './LocaleProvider';
import { localizedHref } from '@/lib/i18n/routing';
import { translateText } from '@/lib/i18n/translate';
export default function LocaleLink({ href, children, ...props }) {
  const locale = useLocale();
  const resolved = localResourceHref(typeof href === 'object' ? href.pathname : href);
  const target = typeof href === 'object' ? { ...href, pathname: localizedHref(resolved, locale) } : localizedHref(resolved, locale);
  for (const key of ['title','aria-label']) if (typeof props[key] === 'string') props[key] = translateText(props[key], locale);
  const content=props['data-no-translate'] ? children : Children.map(children, child => typeof child === 'string' ? translateText(child, locale) : child);
  if(resolved===null){const {target:ignoredTarget,rel:ignoredRel,download:ignoredDownload,...rest}=props;return <span {...rest}>{content}</span>;}
  return <Link href={target} {...props}>{content}</Link>;
}
