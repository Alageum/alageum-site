'use client';

import E from '@/components/locale/LocaleElement';
import Link from '@/components/locale/LocaleLink';
import CorporateArrow from '@/components/public/CorporateArrow';
import {useAuth} from '@/components/AuthProvider';
import {b2bNavigation} from '@/lib/organizations/b2bNavigation';

const taskGroups = [
  ['Запросы и заказы', ['/b2b/quotes', '/b2b/orders']],
  ['Документы и финансы', ['/b2b/documents', '/b2b/finance']],
  ['Компания и поддержка', ['/b2b/profile', '/b2b/members', '/b2b/access-requests', '/b2b/support']],
];

export default function Dashboard() {
  const {profile} = useAuth();
  const available = new Map(b2bNavigation(profile?.permissions));

  return <>
    <header className="b2b-overview">
      <E as="h1">B2B кабинет</E>
      <E as="p" className="b2b-overview-company" data-no-translate>{profile?.organization?.name || '—'}</E>
    </header>
    <E as="p" className="b2b-overview-note">Доступные разделы зависят от вашей роли в организации.</E>
    <div className="b2b-task-groups">
      {taskGroups.map(([title, routes]) => {
        const links = routes.filter(href => available.has(href));
        if (!links.length) return null;
        return <section key={title}>
          <E as="h2">{title}</E>
          <ul className="b2b-overview-links">
            {links.map(href => <li key={href}>
              <Link href={href} prefetch={href === '/b2b/members' ? false : undefined}>
                {available.get(href)}<CorporateArrow />
              </Link>
            </li>)}
          </ul>
        </section>;
      })}
    </div>
  </>;
}
