import { ApiError, apiFetch } from './client.js';
import { getSessionGeneration } from './sessionTransport.js';

export async function getOrganizationMemberships(signal) {
  const items = [], ids = new Set();
  const generation = getSessionGeneration();
  const assertCurrent = () => {
    if (signal?.aborted || generation !== getSessionGeneration()) throw new ApiError(401, { error: { code: 'session_changed', message: 'Сессия изменилась. Обновите список организаций.' } });
  };
  let total;
  for (let page = 1; ; page += 1) {
    assertCurrent();
    const result = await apiFetch(`/organizations?page=${page}&page_size=100`, { signal });
    assertCurrent();
    const invalid = () => new ApiError(502, { error: { code: 'invalid_memberships', message: 'Список организаций изменился или недоступен. Обновите его.' } });
    if (!Array.isArray(result?.items) || result.items.length > 100 || !Number.isSafeInteger(result.total) || result.total < 0 ||
      result.page !== page || result.page_size !== 100 || (total !== undefined && result.total !== total)) throw invalid();
    total = result.total;
    for (const member of result.items) {
      if (!member || typeof member.id !== 'string' || typeof member.organization_id !== 'string' ||
        typeof member.organization_name !== 'string' || typeof member.role_id !== 'string' ||
        typeof member.role_name !== 'string' || !Array.isArray(member.permissions) || ids.has(member.organization_id)) throw invalid();
      ids.add(member.organization_id); items.push(member);
    }
    if (items.length === total) return items;
    if (items.length > total || result.items.length !== 100) throw invalid();
  }
}

export const getOrganizationProfile = (signal) => apiFetch('/organizations/current/profile', { signal });
export const updateOrganizationProfile = (patch, signal) => apiFetch('/organizations/current/profile', {
  method: 'PATCH', body: JSON.stringify(patch), signal,
}, false); // Never refresh and replay a private write under another login.
