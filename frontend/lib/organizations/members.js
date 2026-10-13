export const MEMBERS_PAGE_SIZE = 50;
export const MEMBERS_MAX_PAGE = Number.MAX_SAFE_INTEGER;
export const MEMBERS_PATH = '/b2b/members';

// The UI has one bounded, canonical pagination parameter. Page one is the
// bare path; an explicit page=1 is accepted and replaced without history noise.
export function membersPage(query = '') {
  if (query === '') return 1;
  if (typeof query !== 'string' || !/^page=[1-9][0-9]{0,15}$/.test(query)) return null;
  const value = Number(query.slice(5));
  return Number.isSafeInteger(value) && value <= MEMBERS_MAX_PAGE ? value : null;
}

export const rawMembersQuery = () => window.location.search.slice(1);
export function subscribeMembersLocation(listener) {
  window.addEventListener('popstate', listener);
  window.addEventListener('alageum:members-location', listener);
  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener('alageum:members-location', listener);
  };
}

export function membersHref(page) {
  if (!Number.isSafeInteger(page) || page < 1 || page > MEMBERS_MAX_PAGE) return null;
  return page === 1 ? MEMBERS_PATH : `${MEMBERS_PATH}?page=${page}`;
}

// No URL decoding, prefixes, fragments, other filters, or open redirects.
export function membersDestination(value) {
  if (value === MEMBERS_PATH) return MEMBERS_PATH;
  if (typeof value !== 'string' || !value.startsWith(`${MEMBERS_PATH}?`)) return null;
  const page = membersPage(value.slice(MEMBERS_PATH.length + 1));
  return page === null || value === `${MEMBERS_PATH}?` ? null : membersHref(page);
}

export const initialMembersRead = () => ({ status: 'loading', value: null, error: null });

export function membersReadError(error) {
  if (error?.status === 401) return 'Сессия завершилась. Войдите снова.';
  if (error?.status === 403) return 'Нет доступа к участникам организации.';
  if (error?.code === 'invalid_members_response') return 'Не удалось подтвердить список участников. Повторите загрузку.';
  return 'Не удалось загрузить участников. Повторите попытку.';
}

// A reader belongs to exactly one mounted page and account/tenant/login scope.
// Invalidation also protects against responses whose transport ignores abort.
export function createMembersRead({ load, isCurrent, onChange }) {
  let controller, disposed = false;
  return {
    async reload() {
      if (disposed) return;
      // Even an obsolete scope must lose old data and request ownership.
      controller?.abort();
      controller = null;
      onChange(initialMembersRead());
      if (!isCurrent()) return;
      const request = new AbortController();
      controller = request;
      const current = () => !disposed && !request.signal.aborted && controller === request && isCurrent();
      try {
        const value = await load({ signal: request.signal });
        if (current()) onChange({ status: 'ready', value, error: null });
      } catch (error) {
        if (current()) onChange({ status: 'error', value: null, error });
      }
    },
    dispose() { disposed = true; controller?.abort(); },
  };
}
