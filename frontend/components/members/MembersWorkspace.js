'use client';import LocaleElement from "@/components/locale/LocaleElement";

import { useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { getOrganizationMembers } from '@/lib/api/members';
import { createMembersRead, initialMembersRead, membersHref, membersPage, membersReadError, rawMembersQuery, subscribeMembersLocation, MEMBERS_MAX_PAGE, MEMBERS_PAGE_SIZE } from '@/lib/organizations/members';
import styles from './MembersWorkspace.module.css';

function goToPage(page) {
  const href = membersHref(page);
  if (href) {
    window.history.pushState(null, '', href);
    window.dispatchEvent(new Event('alageum:members-location'));
  }
}

function MembersList({ scope, page }) {
  const { isAuthScopeCurrent } = useAuth();
  const [state, setState] = useState(initialMembersRead);
  const reader = useRef(null);
  useLayoutEffect(() => {
    const flow = createMembersRead({ load: (options) => getOrganizationMembers(page, options), isCurrent: () => isAuthScopeCurrent(scope), onChange: setState });
    reader.current = flow;
    // Clear restored history state before paint; Strict Mode can discard its
    // first setup before any request starts.
    Promise.resolve().then(() => flow.reload());
    const restored = (event) => {
      if (!event.persisted) return;
      // Another full document may have changed this tab's sessionStorage while
      // this document was frozen. Hide its old data even when reload's captured
      // scope is already invalid, then resynchronize the existing auth boundary.
      setState(initialMembersRead());
      window.dispatchEvent(new Event('alageum:session-changed'));
      flow.reload();
    };
    window.addEventListener('pageshow', restored);
    return () => {flow.dispose();window.removeEventListener('pageshow', restored);if (reader.current === flow) reader.current = null;};
  }, [page, scope, isAuthScopeCurrent]);
  const value = state.value;
  const pageCount = value ? Math.max(1, Math.ceil(value.total / MEMBERS_PAGE_SIZE)) : null;
  return <LocaleElement as="section" className={styles.workspace} aria-label="Участники организации" data-testid="members-list" aria-busy={state.status === 'loading'}>
    <LocaleElement as="p" className="muted" id="members-status-help">В списке могут быть неактивные участники. Статус активности здесь не показан.</LocaleElement>
    {state.status === 'loading' && <LocaleElement as="p" role="status">Загрузка участников…</LocaleElement>}
    {state.status === 'error' && <LocaleElement as="div" className="card">
      <LocaleElement as="p" className="error" role="alert">{membersReadError(state.error)}</LocaleElement>
      <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => reader.current?.reload()}>Повторить</LocaleElement>
    </LocaleElement>}
    {state.status === 'ready' && <>
      <LocaleElement as="p" data-testid="members-total" role="status">Всего участников: {value.total}</LocaleElement>
      {value.items.length ? <LocaleElement as="ul" className={styles.list} aria-describedby="members-status-help">
        {value.items.map((item) => <LocaleElement as="li" className={`card ${styles.member}`} key={item.membership_id} data-testid="member-row">
          <LocaleElement as="dl">
            <LocaleElement as="div"><LocaleElement as="dt">Имя</LocaleElement><LocaleElement as="dd" data-testid="member-name">{item.display_name}</LocaleElement></LocaleElement>
            <LocaleElement as="div"><LocaleElement as="dt">Email</LocaleElement><LocaleElement as="dd" data-testid="member-email">{item.email}</LocaleElement></LocaleElement>
            <LocaleElement as="div"><LocaleElement as="dt">Роль</LocaleElement><LocaleElement as="dd" data-testid="member-role">{item.role_name}</LocaleElement></LocaleElement>
          </LocaleElement>
        </LocaleElement>)}
      </LocaleElement> : <LocaleElement as="p" className="card" data-testid="members-empty">{value.total === 0 ? 'Участников пока нет.' : 'На этой странице нет участников. Выберите другую страницу.'}</LocaleElement>}
    </>}
    <LocaleElement as="nav" className={styles.pagination} aria-label="Страницы участников">
      <LocaleElement as="p">Страница {page}{pageCount !== null ? ` из ${pageCount}` : ''}. По {MEMBERS_PAGE_SIZE} участников.</LocaleElement>
      <LocaleElement as="div" className={styles.actions}>
        {page > 1 && <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => goToPage(1)}>К первой странице</LocaleElement>}
        <LocaleElement as="button" className="buttonSecondary" type="button" disabled={page <= 1} onClick={() => goToPage(page - 1)}>Предыдущая</LocaleElement>
        <LocaleElement as="button" className="buttonSecondary" type="button" disabled={!value || page >= pageCount || page >= MEMBERS_MAX_PAGE} onClick={() => goToPage(page + 1)}>Следующая</LocaleElement>
        {state.status !== 'error' && <LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => reader.current?.reload()}>Обновить список</LocaleElement>}
      </LocaleElement>
    </LocaleElement>
  </LocaleElement>;
}

export default function MembersAccess() {
  const { loading, authScope, hasPermission } = useAuth();
  // Keep the Next router subscription, but validate the browser's raw query so
  // encoded keys/values cannot silently become an accepted canonical parameter.
  useSearchParams();
  const query = useSyncExternalStore(subscribeMembersLocation, rawMembersQuery, () => null);
  const page = membersPage(query);
  useLayoutEffect(() => {
    if (query === 'page=1') {
      // Next's documented null-data API carries its router state forward and
      // synchronizes hooks; passing its reserved state would bypass that work.
      window.history.replaceState(null, '', membersHref(1));
      window.dispatchEvent(new Event('alageum:members-location'));
    }
  }, [query]);
  if (loading || query === null) return <LocaleElement as="p" role="status">Проверка доступа…</LocaleElement>;
  if (!hasPermission('organization.manage_users')) return <LocaleElement as="section" className="card"><LocaleElement as="p" role="alert">У вашей учётной записи нет доступа к участникам организации.</LocaleElement></LocaleElement>;
  if (page === null) return <LocaleElement as="section" className="card"><LocaleElement as="p" role="alert">Некорректный номер страницы. Вернитесь к первой странице.</LocaleElement><LocaleElement as="button" className="buttonSecondary" type="button" onClick={() => goToPage(1)}>К первой странице</LocaleElement></LocaleElement>;
  return <MembersList key={`${authScope}:${page}`} scope={authScope} page={page} />;
}
