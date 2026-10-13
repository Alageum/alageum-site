import { ApiError, apiFetch } from './client.js';
import { MEMBERS_MAX_PAGE, MEMBERS_PAGE_SIZE } from '../organizations/members.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const exact = (value, keys) => Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
const keys = ['membership_id', 'user_id', 'email', 'display_name', 'role_id', 'role_name'];
const validMember = value => exact(value, keys) && ['membership_id', 'user_id', 'role_id'].every(key => uuid(value[key])) &&
  ['email', 'display_name', 'role_name'].every(key => typeof value[key] === 'string');
const invalid = () => new ApiError(502, { error: { code: 'invalid_members_response', message: 'Не удалось подтвердить список участников.' } });

export async function getOrganizationMembers(page = 1, { signal } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || page > MEMBERS_MAX_PAGE) {
    throw new ApiError(422, { error: { code: 'invalid_members_page', message: 'Некорректная страница участников.' } });
  }
  const value = await apiFetch(`/organizations/members?page=${page}&page_size=${MEMBERS_PAGE_SIZE}`, { signal });
  if (!exact(value, ['items', 'page', 'page_size', 'total']) || value.page !== page || value.page_size !== MEMBERS_PAGE_SIZE ||
    !Number.isSafeInteger(value.total) || value.total < 0 || !Array.isArray(value.items) || !value.items.every(validMember) ||
    // Count and rows are separate reads: concurrent membership changes may
    // legitimately make the returned row count differ from the reported total.
    value.items.length > MEMBERS_PAGE_SIZE ||
    new Set(value.items.map(item => item.membership_id.toLowerCase())).size !== value.items.length) throw invalid();
  return value;
}
