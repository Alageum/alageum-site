import Link from '@/components/locale/LocaleLink';
import SiteStatus from '@/components/public/SiteStatus';

export default function NotFound() {
  return <SiteStatus code="404" title="Страница не найдена" description="Проверьте адрес или вернитесь на главную.">
    <Link href="/" className="site-button site-button-primary">На главную</Link>
    <Link href="/catalog" className="site-text-link">Перейти в каталог</Link>
  </SiteStatus>;
}
