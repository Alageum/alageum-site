import { membersDestination } from '../organizations/members.js';

// Fixed application destinations only: never honor arbitrary URL/JS redirects.
export function loginDestination(value) {
  const members = membersDestination(value);
  if (members) return members;
  if (['/admin/catalog', '/b2b', '/b2b/orders', '/b2b/quotes', '/b2b/profile', '/b2b/support', '/b2b/finance', '/b2b/documents', '/inquiry?source=api'].includes(value)) return value;
  if (typeof value === 'string' && /^\/b2b\/orders\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return value;
  if (typeof value === 'string' && /^\/b2b\/quotes\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?:\/print)?$/i.test(value)) return value;
  return '/b2b';
}
