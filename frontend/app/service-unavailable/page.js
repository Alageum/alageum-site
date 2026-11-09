import Link from '@/components/locale/LocaleLink';
import SiteStatus from '@/components/public/SiteStatus';
import { PUBLIC_UNAVAILABLE_MESSAGE } from '@/lib/deployment/publicMode';

export const metadata = { title: 'Сервис временно недоступен', robots: { index: false, follow: false } };
export default function ServiceUnavailablePage() {
  return <SiteStatus code="ALAGEUM ELECTRIC" title="Сервис временно недоступен" description={PUBLIC_UNAVAILABLE_MESSAGE}
    note="Данные из черновиков сохраняются только в этом браузере и не отправляются компании автоматически.">
    <Link className="site-button site-button-primary" href="/catalog">Открыть каталог</Link>
    <Link className="site-text-link" href="/client">Локальные черновики</Link>
    <Link className="site-text-link" href="/contacts">Контакты компании</Link>
  </SiteStatus>;
}
