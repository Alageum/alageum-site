import { ApiError, apiFetch } from './client.js';

async function post(path, body, signal) {
  const value = await apiFetch(path, { method: 'POST', body: JSON.stringify(body), signal }, false);
  const expected = path === '/auth/verify-email' ? 'verified' : path === '/auth/reset-password' ? 'password_reset' : 'accepted';
  if (path.includes('access-requests') ? !value?.request?.id : value?.status !== expected) throw new ApiError(502, { error: { code: 'invalid_account_response' } });
  return value;
}
export const registerAccount = ({ email, password, display_name }, signal) => post('/auth/register', { email: email.trim(), password, display_name: display_name.trim() }, signal);
export const verifyAccountEmail = (token, signal) => post('/auth/verify-email', { token }, signal);
export const resendAccountVerification = (email, signal) => post('/auth/resend-verification', { email: email.trim() }, signal);
export const forgotAccountPassword = (email, signal) => post('/auth/forgot-password', { email: email.trim() }, signal);
export const resetAccountPassword = (token, password, signal) => post('/auth/reset-password', { token, password }, signal);
export async function getPersonalAccount(signal) {
  const value = await apiFetch('/auth/account', { signal });
  if (!value?.user?.id || typeof value.user.email !== 'string' || !Array.isArray(value.company_requests)) throw new ApiError(502, { error: { code: 'invalid_account_response' } });
  return value;
}
export const requestCompanyAccess = ({ company_name, company_identifier, message }, signal) => post('/auth/company-access-requests', {
  company_name: company_name.trim(), company_identifier: company_identifier.trim(), message: message.trim(),
}, signal);
export async function getCompanyAccessReview(signal) {
  const [requests, roles] = await Promise.all([
    apiFetch('/organization/access-requests', { signal }),
    apiFetch('/organization/access-roles', { signal }),
  ]);
  if (!Array.isArray(requests?.items) || !Array.isArray(roles?.items)) throw new ApiError(502, { error: { code: 'invalid_access_requests_response' } });
  return { requests: requests.items, roles: roles.items };
}
export const approveCompanyAccess = (id, role_id, signal) => post(`/organization/access-requests/${encodeURIComponent(id)}/approve`, { role_id }, signal);
export const rejectCompanyAccess = (id, reason, signal) => post(`/organization/access-requests/${encodeURIComponent(id)}/reject`, { reason: reason.trim() }, signal);
