import { test, expect } from '@playwright/test';
const federatedAlert = page => page.getByRole('region', { name: 'Регистрация и вход через внешние сервисы', exact: true }).getByRole('alert');
const id = '10000000-0000-4000-8000-000000000001';
const json = (route, value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
async function fixture(page, available = true) {
  await page.route('**/api/v1/auth/providers', route => json(route, { google: { available }, egov: { available: false } }));
  await page.route('**/api/v1/auth/google/cancel', route => route.fulfill({ status: 204 }));
}
test('unconfigured Google and eGov remain visibly disabled, with honest company-access explanation', async ({ page }) => {
  await fixture(page, false); await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Продолжить с Google' })).toBeDisabled();
  await expect(page.getByText('Вход через Google пока не подключён.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Продолжить с eGov' })).toBeDisabled();
  await expect(page.getByText('При первом входе создаётся личный аккаунт.', { exact: false })).toBeVisible();
});
test('cancel during deferred prepare prevents start or redirect and releases password login', async ({ page }) => {
  await fixture(page); let prepared, count = 0, starts = 0;
  await page.route('**/api/v1/auth/google/prepare', route => { count++; prepared = route; });
  await page.route('**/api/v1/auth/google/start', route => { starts++; return json(route, {}); });
  await page.goto('/login'); await page.getByRole('button', { name: 'Продолжить с Google' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Отменить вход через Google' }).click();
  await expect(page.getByText('Отменяем вход…')).toBeVisible();
  await json(prepared, { flow_id: id });
  await expect(page.getByLabel('Email', { exact: true })).toBeEnabled();
  await expect(page.getByText('Вход через Google отменён.')).toBeVisible();
  expect(starts).toBe(0); expect(count).toBe(1); await expect(page).toHaveURL(/\/login$/);
});
test('new registration completes cookie bootstrap but does not gain a company role', async ({ page }) => {
  await fixture(page);
  await page.route('**/api/v1/auth/browser-session?*', route => json(route, { session_id: id, user: { id, email: 'fixture@example.test', display_name: 'Fixture' } }));
  await page.route('**/api/v1/auth/me', route => json(route, { error: { code: 'organization_access_denied', message: 'No membership' } }, 403));
  await page.route('**/api/v1/organizations?*', route => json(route, { items: [], total: 0, page: 1, page_size: 100 }));
  await page.route('**/api/v1/auth/browser-logout', route => route.fulfill({ status: 204 }));
  await page.goto(`/login?federated=success&session=${id}&next=%2Fb2b%2Fdocuments`);
  await expect(page.getByTestId('organization-empty')).toBeVisible();
  await expect(page).not.toHaveURL(/federated=success/);
  const session = await page.evaluate(() => JSON.parse(sessionStorage.getItem('alageum_session')));
  expect(session.browser_session).toBe(id); expect(session.refresh_token).toBeUndefined(); expect(session.organization_id).toBeUndefined();
  await page.screenshot({ path: '/tmp/alageum-google-registration-pending-membership.png', fullPage: true });
  await page.getByRole('button', { name: 'Отмена выбора' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
});
test('Google email collision and provider cancellation have safe actionable errors', async ({ page }) => {
  await fixture(page);
  await page.goto('/login?federated=account_link_required&error_description=PRIVATE-VALUE');
  await expect(federatedAlert(page)).toContainText('Войдите прежним способом');
  await expect(federatedAlert(page)).not.toContainText('PRIVATE-VALUE');
  await page.goto('/login?federated=provider_cancelled');
  await expect(federatedAlert(page)).toContainText('отменён');
  await expect(page.getByRole('button', { name: 'Продолжить с Google' })).toBeEnabled();
});
test('stale cross-tab cookie boundary can dismiss organization choice after logout 401', async ({ page }) => {
  await fixture(page);
  await page.addInitScript(id => sessionStorage.setItem('alageum_session', JSON.stringify({ access_token: `browser:${id}`, browser_session: id })), id);
  await page.route('**/api/v1/auth/me', route => json(route, { error: { code: 'organization_access_denied' } }, 403));
  await page.route('**/api/v1/organizations?*', route => json(route, { items: [], total: 0, page: 1, page_size: 100 }));
  await page.route('**/api/v1/auth/browser-logout', route => json(route, { error: { code: 'authentication_required' } }, 401));
  await page.goto('/login'); await expect(page.getByTestId('organization-empty')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена выбора' }).click();
  await expect(page.getByLabel('Email', { exact: true })).toBeVisible();
});

test('late cancellation feedback cannot overwrite a newer failed login attempt', async ({ page }) => {
  await fixture(page); let cancelA, starts = 0;
  await page.route('**/api/v1/auth/google/prepare', route => json(route, { flow_id: id }));
  await page.route('**/api/v1/auth/google/start', route => {
    starts++;
    if (starts > 1) return json(route, { error: { code: 'test_newer_error', message: 'Новая ошибка B' } }, 503);
    // The first request stays pending until the user cancels it.
  });
  await page.unroute('**/api/v1/auth/google/cancel');
  await page.route('**/api/v1/auth/google/cancel', route => { cancelA = route; });
  await page.goto('/login'); await page.getByRole('button', { name: 'Продолжить с Google' }).click();
  await expect.poll(() => starts).toBe(1);
  await page.getByRole('button', { name: 'Отменить вход через Google' }).click();
  await expect(page.getByRole('button', { name: 'Продолжить с Google' })).toBeEnabled();
  await page.getByRole('button', { name: 'Продолжить с Google' }).click();
  await expect(federatedAlert(page)).toHaveText('Новая ошибка B');
  await cancelA.fulfill({ status: 204 });
  await expect(federatedAlert(page)).toHaveText('Новая ошибка B');
});

test('failed cancel after deferred preparation reports a terminal warning', async ({ page }) => {
  await fixture(page); let prepared;
  await page.route('**/api/v1/auth/google/prepare', route => { prepared = route; });
  await page.unroute('**/api/v1/auth/google/cancel');
  await page.route('**/api/v1/auth/google/cancel', route => json(route, { error: { code: 'unavailable' } }, 503));
  await page.goto('/login'); await page.getByRole('button', { name: 'Продолжить с Google' }).click();
  await page.getByRole('button', { name: 'Отменить вход через Google' }).click();
  await json(prepared, { flow_id: id });
  await expect(federatedAlert(page)).toContainText('Не удалось отменить попытку на сервере');
  await expect(page.getByRole('button', { name: 'Продолжить с Google' })).toBeEnabled();
});
