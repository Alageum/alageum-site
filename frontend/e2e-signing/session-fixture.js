// Public per-tab boundary only. Browser credentials are HttpOnly cookies in the
// application; these transport fixtures intercept API responses, not authentication.
export const signingSessionId = 'a0000000-0000-4000-8000-000000000001';
export const nextSigningSessionId = 'a0000000-0000-4000-8000-000000000002';
export const signingBrowserSession = organization_id => ({ browser_session: signingSessionId, organization_id });
