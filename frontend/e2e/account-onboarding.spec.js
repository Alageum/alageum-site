import { test, expect } from '@playwright/test';

const sessionId = '22222222-2222-4222-8222-222222222222';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'buyer@example.test', display_name: 'Test Buyer' };
const organization = { id: '33333333-3333-4333-8333-333333333333', name: 'Test Company' };
const request = { id: '44444444-4444-4444-8444-444444444444', user, company_name: 'Test Company', company_identifier: '123456789012', message: 'Company employee', status: 'pending' };
const role = { id: '55555555-5555-4555-8555-555555555555', name: 'Buyer', code: 'buyer' };
const json = (route, payload, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(payload) });

async function setup(page, { admin = false, companyRequests = [] } = {}) {
  await page.addInitScript(({ sessionId, organization, admin }) => sessionStorage.setItem('alageum_session', JSON.stringify({ browser_session: sessionId, ...(admin ? { organization_id: organization.id } : {}) })), { sessionId, organization, admin });
  await page.route('**/api/v1/auth/me', route => admin ? json(route, { user, organization, permissions: ['organization.manage_users'] }) : json(route, { error: { code: 'organization_required' } }, 403));
  await page.route('**/api/v1/auth/account', route => json(route, { user, email_verified: true, onboarding_status: companyRequests.length ? 'pending' : 'no_company', company_requests: companyRequests, permissions: [] }));
}

test('registration validates mismatch and submits once while pending', async ({ page }) => {
  await setup(page); let count = 0;
  await page.route('**/api/v1/auth/register', async route => { count++; await new Promise(resolve => setTimeout(resolve, 150)); await json(route, { status: 'accepted' }, 202); });
  await page.goto('/register');
  await page.getByLabel('Имя и фамилия').fill('Test Buyer'); await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Пароль', { exact: true }).fill('long-password-123'); await page.getByLabel('Повторите пароль').fill('long-password-456');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Пароли не совпадают.'); expect(count).toBe(0);
  await page.getByLabel('Повторите пароль').fill('long-password-123');
  await page.getByRole('button', { name: 'Создать аккаунт', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Создание аккаунта…' })).toBeDisabled();
  await expect(page.getByRole('heading', { name: 'Проверьте почту' })).toBeVisible(); expect(count).toBe(1);
  await expect(page.locator('input[type=password]')).toHaveCount(0);
});

test('verification requires a click, removes token from address and can resend expired link', async ({ page }) => {
  await setup(page); let count = 0;
  await page.route('**/api/v1/auth/verify-email', route => { count++; return json(route, { error: { code: 'invalid_token' } }, 400); });
  await page.route('**/api/v1/auth/resend-verification', route => json(route, { status: 'accepted' }, 202));
  await page.goto(`/verify-email?token=${'a'.repeat(64)}`);
  await expect(page.getByRole('button', { name: 'Подтвердить email', exact: true })).toBeEnabled();
  await expect(page).toHaveURL(/\/verify-email$/); expect(count).toBe(0);
  await page.getByRole('button', { name: 'Подтвердить email', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Ссылка недействительна'); expect(count).toBe(1);
  await page.getByLabel('Email', { exact: true }).fill(user.email); await page.getByRole('button', { name: 'Отправить письмо повторно' }).click();
  await expect(page.getByRole('status')).toContainText('Если для этого адреса');
});

test('reset validates and leaves new login explicit after success', async ({ page }) => {
  await setup(page); let body;
  await page.route('**/api/v1/auth/reset-password', route => { body = route.request().postDataJSON(); return json(route, { status: 'password_reset' }); });
  await page.goto(`/reset-password#token=${'b'.repeat(64)}`);
  await page.getByLabel('Новый пароль', { exact: true }).fill('new-password-123'); await page.getByLabel('Повторите пароль').fill('new-password-123');
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByRole('heading', { name: 'Пароль изменён' })).toBeVisible();
  expect(body).toEqual({ token: 'b'.repeat(64), password: 'new-password-123' }); await expect(page).toHaveURL(/\/reset-password$/);
  await expect(page.getByRole('link', { name: 'Войти в личный кабинет' })).toHaveAttribute('href', '/login?next=%2Faccount');
});

test('pending account remains usable and labels local drafts honestly', async ({ page }) => {
  await setup(page, { companyRequests: [request] });
  await page.goto('/account');
  await expect(page.getByRole('heading', { name: 'Test Buyer' })).toBeVisible();
  await expect(page.getByText('На проверке', { exact: true })).toBeVisible();
  await expect(page.getByText(/Регистрация не отправляет их на сервер/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Открыть черновики' })).toHaveAttribute('href', '/client');
  await expect(page.getByRole('link', { name: 'Открыть кабинет компании' })).toHaveCount(0);
});

test('requesting access sends only identity fields, never a role or permission', async ({ page }) => {
  await setup(page); let body;
  await page.route('**/api/v1/auth/company-access-requests', route => { body = route.request().postDataJSON(); return json(route, { request }, 201); });
  await page.goto('/account');
  await page.getByLabel('Название компании').fill(' Test Company '); await page.getByLabel('БИН / идентификатор компании').fill(request.company_identifier);
  await page.getByLabel('Комментарий для администратора').fill('Company employee');
  await page.getByRole('button', { name: 'Запросить доступ', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Заявка отправлена на сервер');
  expect(body).toEqual({ company_name: 'Test Company', company_identifier: request.company_identifier, message: 'Company employee' });
});

test('non-admin cannot read the approval API', async ({ page }) => {
  await setup(page); let reads = 0;
  await page.route('**/api/v1/organization/access-**', route => { reads++; return json(route, { items: [] }); });
  await page.goto('/b2b/access-requests');
  await expect(page.getByText(/Нет доступа к управлению участниками компании|Для доступа к данным компании необходимо подтверждённое членство/)).toBeVisible(); expect(reads).toBe(0);
});

test('approval requires an explicit role and confirmation; cancel is read-only', async ({ page }) => {
  await setup(page, { admin: true }); let approvals = 0, body;
  await page.route('**/api/v1/organization/access-requests', route => json(route, { items: [request] }));
  await page.route('**/api/v1/organization/access-roles', route => json(route, { items: [role] }));
  await page.route(`**/api/v1/organization/access-requests/${request.id}/approve`, route => { approvals++; body = route.request().postDataJSON(); return json(route, { request: { ...request, status: 'approved' } }); });
  await page.goto('/b2b/access-requests');
  await expect(page.getByRole('button', { name: 'Одобрить', exact: true })).toBeDisabled();
  await page.getByLabel('Роль в текущей компании').selectOption(role.id);
  await page.getByRole('button', { name: 'Одобрить', exact: true }).click(); await page.getByRole('button', { name: 'Отмена', exact: true }).click(); expect(approvals).toBe(0);
  await page.getByRole('button', { name: 'Одобрить', exact: true }).click(); await page.getByRole('button', { name: 'Подтвердить решение' }).click();
  await expect.poll(() => approvals).toBe(1); expect(body).toEqual({ role_id: role.id });
});


test('logged-out personal account never loops on authenticated API reads', async ({ page }) => {
  let reads = 0;
  await page.route('**/api/v1/auth/account', route => { reads++; return json(route, { error: { code: 'authentication_required' } }, 401); });
  await page.goto('/account');
  await expect(page.getByText('Войдите или создайте аккаунт, чтобы запросить доступ к компании.')).toBeVisible();
  expect(reads).toBe(0);
});

test('a second verification link in the same tab clears the previous result', async ({ page }) => {
  await setup(page); const tokens = [];
  await page.route('**/api/v1/auth/verify-email', route => { tokens.push(route.request().postDataJSON().token); return json(route, { status: 'verified' }); });
  await page.goto(`/verify-email#token=${'a'.repeat(64)}`);
  await page.getByRole('button', { name: 'Подтвердить email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Email подтверждён' })).toBeVisible();
  await page.evaluate(token => { window.location.hash = `token=${token}`; }, 'b'.repeat(64));
  await page.getByRole('button', { name: 'Подтвердить email', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Email подтверждён' })).toBeVisible();
  expect(tokens).toEqual(['a'.repeat(64), 'b'.repeat(64)]);
});
