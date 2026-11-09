'use client';

import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import SiteStatus from '@/components/public/SiteStatus';

export default function EditorialError({ reset }) {
  return <SiteStatus code="ALAGEUM ELECTRIC" title="Не удалось загрузить страницу" description="Пожалуйста, попробуйте ещё раз." alert>
    <LocaleElement as="button" type="button" className="site-button site-button-primary" onClick={reset}>Повторить</LocaleElement>
    <Link href="/" className="site-text-link">На главную</Link>
  </SiteStatus>;
}
