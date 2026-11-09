'use client';

import LocaleElement from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import SiteStatus from '@/components/public/SiteStatus';

export default function ErrorPage({ reset }) {
  return <SiteStatus code="ВРЕМЕННАЯ ОШИБКА" title="Не удалось открыть страницу" description="Попробуйте загрузить страницу ещё раз." alert>
    <LocaleElement as="button" type="button" className="site-button site-button-primary" onClick={reset}>Повторить</LocaleElement>
    <Link href="/catalog" className="site-text-link">Перейти в каталог</Link>
  </SiteStatus>;
}
