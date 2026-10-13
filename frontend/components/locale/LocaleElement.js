'use client';
import SelectionIndicator from '@/components/ui/SelectionIndicator';
import DesignSelect from '@/components/ui/DesignSelect';
import { localResourceHref } from '@/lib/public/localResources';
import { Children } from 'react';
import { useLocale } from './LocaleProvider';
import { translateText } from '@/lib/i18n/translate';
import { localizedHref } from '@/lib/i18n/routing';
export default function LocaleElement({ as: Tag = 'span', children, ...props }) {
  const locale = useLocale();
  const attributes = { ...props };
  for (const key of ['alt', 'title', 'placeholder', 'aria-label', 'aria-description']) if (typeof attributes[key] === 'string') attributes[key] = translateText(attributes[key], locale);
  if (Tag === 'a') attributes.href = localizedHref(localResourceHref(attributes.href), locale);
  const translated = props['data-no-translate'] ? children : Children.map(children, child => typeof child === 'string' ? translateText(child, locale) : child);
  if(Tag==='input'&&attributes.type==='checkbox')return <SelectionIndicator {...attributes}/>;
  if(Tag==='select')return <DesignSelect {...attributes}>{translated}</DesignSelect>;
  return <Tag {...attributes}>{translated}</Tag>;
}
