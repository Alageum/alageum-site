import Link from '@/components/locale/LocaleLink';
import LocaleElement from '@/components/locale/LocaleElement';
import { PUBLIC_UNAVAILABLE_MESSAGE } from '@/lib/deployment/publicMode';

export const metadata = { title: 'Сервис временно недоступен', robots: { index: false, follow: false } };
export default function ServiceUnavailablePage() {
  return <LocaleElement as="section" className="site-container site-info-page">
    <LocaleElement as="p" className="site-eyebrow">ALAGEUM ELECTRIC</LocaleElement>
    <LocaleElement as="h1">Сервис временно недоступен</LocaleElement>
    <LocaleElement as="p">{PUBLIC_UNAVAILABLE_MESSAGE}</LocaleElement>
    <LocaleElement as="p">Данные из черновиков сохраняются только в этом браузере и не отправляются компании автоматически.</LocaleElement>
    <LocaleElement as="div" className="site-actions"><Link className="site-button" href="/catalog">Открыть каталог</Link><Link className="site-text-link" href="/client">Локальные черновики</Link><Link className="site-text-link" href="/contacts">Контакты компании</Link></LocaleElement>
  </LocaleElement>;
}
