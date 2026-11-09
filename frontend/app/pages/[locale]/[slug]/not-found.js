import Link from '@/components/locale/LocaleLink';
import SiteStatus from '@/components/public/SiteStatus';

export default function EditorialNotFound() {
  return <SiteStatus code="404" title="Страница не найдена" description="Эта страница недоступна на выбранном языке.">
    <Link href="/" className="site-button site-button-primary">На главную</Link>
  </SiteStatus>;
}
