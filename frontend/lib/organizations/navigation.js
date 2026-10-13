import { membersDestination } from './members.js';

// A tenant switch cannot carry a previous tenant's record identifier or filters.
export function organizationDestination(pathname) {
  const members = membersDestination(pathname);
  if (members) return members;
  const lists = ['/b2b', '/b2b/profile', '/b2b/orders', '/b2b/documents', '/b2b/finance', '/b2b/quotes', '/b2b/support'];
  if (lists.includes(pathname)) return pathname;
  if (pathname?.startsWith('/b2b/orders/')) return '/b2b/orders';
  if (pathname?.startsWith('/b2b/quotes/')) return '/b2b/quotes';
  return '/b2b';
}

export function organizationContentBoundary(previous, key, sessionGeneration, pathname) {
  if (!key || previous.key === key) return previous;
  // A fresh stale-session detail may never install an authorized old profile.
  // Its original generation still marks the context from which recovery began.
  // An ordinary initial login return mounts this boundary AFTER its selection.
  const contextChanged = previous.key !== null || previous.sessionGeneration !== sessionGeneration;
  return { key, sessionGeneration, blockedPath: contextChanged && organizationDestination(pathname) !== pathname ? pathname : null };
}
