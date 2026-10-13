import assert from 'node:assert/strict';
import test from 'node:test';
import { passwordError, readAccountToken, createAccountOperation, accountError, companyRequestLabels } from '../lib/account/model.js';
import { readFile } from 'node:fs/promises';

const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('password validation preserves whitespace and requires matching 12..128 characters', () => {
  assert.ok(passwordError('short', 'short'));
  assert.ok(passwordError('a'.repeat(129), 'a'.repeat(129)));
  assert.ok(passwordError('long-password', 'other-password'));
  assert.equal(passwordError(' valid pass ', ' valid pass '), '');
});
test('one-time token parsing removes secrets and preserves unrelated location state', () => {
  const token = 'a'.repeat(64);
  assert.deepEqual(readAccountToken({ pathname: '/en/verify-email', search: `?token=${token}&next=%2Faccount`, hash: '' }), { token, cleanHref: '/en/verify-email?next=%2Faccount' });
  assert.deepEqual(readAccountToken({ pathname: '/reset-password', search: '', hash: `#token=${token}` }), { token, cleanHref: '/reset-password' });
  for (const search of ['?token=short', `?token=${token}&token=${token}`, '?token=%3Cscript%3E']) assert.equal(readAccountToken({ pathname: '/verify-email', search }).token, '');
  assert.equal(readAccountToken({ pathname: '/verify-email', search: `?token=${token}`, hash: `#token=${token}` }).token, '');
});
test('double clicks share one active operation and allow an explicit later retry', async () => {
  const operation = createAccountOperation(), wait = deferred();
  let calls = 0, accepted = 0;
  const first = operation.run(() => { calls++; return wait.promise; }, () => accepted++, assert.fail);
  assert.equal(await operation.run(() => { calls++; }, assert.fail, assert.fail), false);
  wait.resolve({ status: 'accepted' }); await first;
  assert.equal(calls, 1); assert.equal(accepted, 1);
  await operation.run(() => { calls++; }, () => accepted++, assert.fail);
  assert.equal(calls, 2); assert.equal(accepted, 2);
});
test('navigation/unmount aborts the request and ignores late success and failure', async () => {
  for (const failure of [false, true]) {
    const operation = createAccountOperation(), wait = deferred(); let signal;
    const result = operation.run(value => { signal = value; return wait.promise; }, assert.fail, assert.fail);
    operation.dispose(); assert.equal(signal.aborted, true);
    if (failure) wait.reject(new Error('late network failure')); else wait.resolve('late secret');
    await result;
    assert.equal(await operation.run(assert.fail, assert.fail, assert.fail), false);
  }
});
test('failed operation clears ownership and a new request can succeed', async () => {
  const operation = createAccountOperation(); let rejected = 0, accepted = 0;
  await operation.run(() => Promise.reject({ status: 503 }), () => assert.fail(), () => rejected++);
  await operation.run(() => Promise.resolve('ok'), () => accepted++, () => assert.fail());
  assert.equal(rejected, 1); assert.equal(accepted, 1);
});
test('public errors do not echo a server exception or disclose account existence', () => {
  assert.ok(accountError({ code: 'invalid_token' }).includes('Ссылка'));
  assert.ok(accountError({ status: 429 }).includes('много попыток'));
  assert.ok(!accountError({ message: 'db password secret account exists' }).includes('secret'));
  assert.ok(accountError({ code: 'mail_unavailable', status: 503 }).includes('не настроена'));
  assert.ok(accountError({ code: 'validation_error', status: 422 }).includes('Проверьте заполненные поля'));
  assert.equal(companyRequestLabels.pending, 'На проверке');
});
test('customer navigation retains local drafts and points account entries to /account', async () => {
  const header = await readFile(new URL('../components/SiteHeader.js', import.meta.url), 'utf8');
  assert.match(header, /href="\/account" className="site-language/);
  assert.match(header, /Локальные черновики.*\/client/);
  const account = await readFile(new URL('../components/account/PersonalAccount.js', import.meta.url), 'utf8');
  assert.match(account, /getPersonalAccount\(controller.signal\)/);
  assert.match(account, /не отправляет их на сервер/);
  assert.doesNotMatch(account, /permissions\s*[:=]\s*\[/);
});
test('company approval starts without a role and is permission/scope gated', async () => {
  const source = await readFile(new URL('../components/account/CompanyAccessReview.js', import.meta.url), 'utf8');
  assert.match(source, /\[roleId, setRoleId\] = useState\(''\)/);
  assert.match(source, /hasPermission\('organization.manage_users'\)/);
  assert.match(source, /isAuthScopeCurrent\(scope\)/);
  assert.match(source, /disabled=\{pending \|\| !role\}/);
  assert.doesNotMatch(source, /catalog\.manage|platform\.admin/);
});
test('all new routes have locale wrappers', async () => {
  for (const route of ['register', 'verify-email', 'forgot-password', 'reset-password', 'account', 'b2b/access-requests']) {
    const source = await readFile(new URL(`../app/[locale]/(site)/${route}/page.js`, import.meta.url), 'utf8');
    assert.match(source, /export \{ default/);
  }
});
