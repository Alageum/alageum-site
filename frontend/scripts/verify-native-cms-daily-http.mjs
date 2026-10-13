import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { request } from '@playwright/test';

// HTTP-only companion to node-cms-daily.spec.js. It does not launch a browser,
// seed/reset data, or change source catalog products. The caller owns servers.
const requireBackend = createRequire(new URL('../../backend-node/package.json', import.meta.url));
const { Client } = requireBackend('pg');
const { validateFixtureEnvironment } = requireBackend('./scripts/seed-test-cms-admins.js');
const fixture = validateFixtureEnvironment(process.env);
if (process.env.ALAGEUM_CMS_BROWSER_DATABASE_URL) {
  assert.ok(process.env.DATABASE_URL === process.env.ALAGEUM_CMS_BROWSER_DATABASE_URL,
    'Use the existing browser fixture database for both the CMS server and audit verification');
}
const cms = process.env.E2E_CMS_BASE_URL || 'http://127.0.0.1:8016/cms';
const origin = new URL(cms).origin;
const api = process.env.E2E_API_URL || `${origin}/api/v1`;
const frontend = process.env.E2E_BASE_URL || 'http://127.0.0.1:3141';
for (const url of [cms, api, frontend]) assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(new URL(url).hostname), 'Only disposable loopback servers are permitted');
assert.equal(new URL(api).origin, origin);
const plugin = `${origin}/alageum-catalog`;
const key = `cms-daily-http-${randomUUID()}`;
const context = await request.newContext();
const db = new Client({ connectionString: process.env.DATABASE_URL });
const completed = [];
let headers;
let product;
let adminId;

async function step(name, run) {
  await run();
  completed.push(name);
  console.log(`PASS ${name}`);
}

async function readNative() {
  const response = await context.get(`${plugin}/products/${product.id}`, { headers });
  assert.equal(response.status(), 200);
  return response.json();
}

async function events() {
  return (await db.query('SELECT action, actor_user_id, organization_id, event_metadata FROM b2b.audit_events WHERE entity_id = $1 OR event_metadata->\'after\'->>\'public_key\' = $2 ORDER BY created_at, id', [product?.id || '', key])).rows;
}

async function publicState(published) {
  for (const identity of [key, product.id, product.slug]) {
    const response = await context.get(`${api}/catalog/products/${identity}`);
    assert.equal(response.status(), published ? 200 : 404);
    if (published) {
      const body = await response.json();
      for (const field of ['id', 'public_key', 'slug', 'translations', 'status', 'version', 'price', 'price_mode', 'currency']) assert.deepEqual(body[field], product[field]);
    }
  }
  const list = await context.get(`${api}/catalog/products?${new URLSearchParams({ public_key: key, page_size: '100' })}`);
  assert.equal(list.status(), 200);
  const result = await list.json();
  assert.equal(result.total, published ? 1 : 0);
  assert.equal(result.items.length, published ? 1 : 0);
  if (published) assert.equal(result.items[0].price, product.price);
}

async function update(patch, action = '') {
  const version = product.version;
  const count = (await events()).length;
  const url = `${plugin}/products/${product.id}${action ? `/${action}` : ''}`;
  const response = await context.fetch(url, { method: action ? 'POST' : 'PUT', headers, data: { ...patch, version } });
  assert.equal(response.status(), 200);
  product = await response.json();
  assert.equal(product.version, version + 1);
  assert.equal((await events()).length, count + 1);
  assert.deepEqual(await readNative(), product, 'A new HTTP read must retain every saved value');
}

async function rejectedUpdate(patch, status = 422, path) {
  const before = await readNative();
  const count = (await events()).length;
  const response = await context.put(`${plugin}/products/${product.id}`, { headers, data: { version: product.version, ...patch } });
  assert.equal(response.status(), status);
  const body = await response.json();
  if (path !== undefined) assert.ok(body.error.details.some(detail => detail.loc.join('.') === path && typeof detail.msg === 'string' && detail.msg.length), `The ${path} validation failure needs a field path and explanation`);
  assert.deepEqual(await readNative(), before, 'Rejected changes must not alter persisted fields or version');
  assert.equal((await events()).length, count, 'Rejected changes must not create audit events');
  await publicState(product.status === 'published');
}

try {
  await db.connect();
  assert.equal((await db.query('SELECT current_database() AS database')).rows[0].database, fixture.database);
  await step('native CMS login uses the disposable editor, without a Super Admin grant', async () => {
    const login = await context.post(`${origin}/admin/login`, { data: { email: 'cms-editor@node-ci.example', password: process.env.E2E_CMS_EDITOR_PASSWORD } });
    assert.equal(login.status(), 200);
    const { data } = await login.json();
    assert.equal(data.user.email, 'cms-editor@node-ci.example');
    const token = data.accessToken || data.token;
    assert.equal(typeof token, 'string');
    headers = { Authorization: `Bearer ${token}` };
    const profileResponse = await context.get(`${origin}/admin/users/me`, { headers });
    assert.equal(profileResponse.status(), 200);
    const { data: profile } = await profileResponse.json();
    assert.ok(profile.roles.length > 0);
    assert.equal(profile.roles.some(role => role.code === 'strapi-super-admin'), false);
    adminId = String(profile.id);
  });

  const categoriesResponse = await context.get(`${plugin}/categories?page_size=100`, { headers });
  assert.equal(categoriesResponse.status(), 200);
  const category = (await categoriesResponse.json()).items.find(item => item.is_published);
  assert.ok(category, 'The disposable catalog must have a published category');
  const draft = { public_key: key, slug: key, category_id: category.id, translations: { ru: { name: `Native CMS daily HTTP ${key}`, description: 'Synthetic disposable verification record' } }, status: 'draft', price_mode: 'on_request', comparable: true };

  await step('missing fields and invalid identities reject creation without records or audits', async () => {
    const cases = [
      [{ ...draft, public_key: '' }, 'public_key'],
      [{ ...draft, slug: '' }, 'slug'],
      [{ ...draft, slug: 'Invalid Slug' }, 'slug'],
      [{ ...draft, category_id: '' }, 'category_id'],
      [{ ...draft, translations: { ru: { name: '' } } }, 'translations'],
      [{ ...draft, price_mode: 'fixed', price: '', currency: 'USD' }, 'price'],
      [{ ...draft, price_mode: 'fixed', price: '12.34', currency: '' }, 'currency'],
    ];
    for (const [data, path] of cases) {
      const response = await context.post(`${plugin}/products`, { headers, data });
      assert.equal(response.status(), 422);
      const body = await response.json();
      assert.ok(body.error.details.some(detail => detail.loc.join('.') === path && detail.msg), `Missing field feedback: ${path}`);
      const list = await context.get(`${plugin}/products?${new URLSearchParams({ public_key: key })}`, { headers });
      assert.equal((await list.json()).total, 0);
      assert.equal((await events()).length, 0);
    }
  });

  await step('native draft creation persists and remains absent from every public identity', async () => {
    const response = await context.post(`${plugin}/products`, { headers, data: draft });
    assert.equal(response.status(), 201);
    product = await response.json();
    assert.equal(product.public_key, key);
    assert.equal(product.version, 1);
    assert.equal(product.status, 'draft');
    assert.equal(product.price, null);
    assert.equal(product.currency, null);
    assert.deepEqual(await readNative(), product);
    assert.equal((await events()).length, 1);
    await publicState(false);
  });

  await step('fixed price and currency persist as exact decimal strings, including large cents', async () => {
    await update({ price_mode: 'fixed', price: '1250.10', currency: 'USD' });
    assert.equal(product.price, '1250.10');
    assert.equal(product.currency, 'USD');
    await update({ price: '90071992547409.91', currency: 'EUR' });
    assert.equal(product.price, '90071992547409.91');
    assert.equal(product.currency, 'EUR');
    assert.equal(product.version, 3);
    const persisted = (await db.query('SELECT price::text AS price, currency, status, version FROM public.alageum_products WHERE transport_id = $1', [product.id])).rows[0];
    assert.equal(persisted.price, '90071992547409.91');
    assert.equal(persisted.currency, 'EUR');
    assert.equal(persisted.status, 'draft');
    assert.equal(persisted.version, 3);
    await publicState(false);
  });

  await step('invalid money, currency, missing name and stale saves retain draft values and audit counts', async () => {
    for (const price of ['', '-1.00', '12.345', '1,25', 'not-a-price', '10000000000000000.00']) await rejectedUpdate({ price }, 422, 'price');
    for (const currency of ['', 'US', 'ZZZ', 'usd']) await rejectedUpdate({ currency }, 422, 'currency');
    await rejectedUpdate({ translations: { ru: { name: '' } } }, 422, 'translations');
    await rejectedUpdate({ price: null }, 422);
    await rejectedUpdate({ currency: null }, 422);
    await rejectedUpdate({ version: 1, price: '1.00' }, 409);
    assert.equal(product.version, 3);
  });

  await step('valid zero price recovers after validation failures, then exact price can be restored', async () => {
    await update({ price: '0', currency: 'USD' });
    assert.equal(product.price, '0.00');
    assert.equal(product.currency, 'USD');
    await update({ price: '90071992547409.91', currency: 'EUR' });
    await publicState(false);
  });

  await step('publishing exposes matching detail and list data; rejected edits keep published values', async () => {
    await update({ status: 'published' });
    assert.equal(product.status, 'published');
    await publicState(true);
    await rejectedUpdate({ price: '-0.01' }, 422, 'price');
    const response = await context.get(`${frontend}/catalog/${key}?source=api`);
    assert.equal(response.status(), 200, 'The production Next route must resolve; rendering still requires the browser suite');
  });

  await step('hide removes detail/list access; restore remains draft until explicitly republished', async () => {
    await update({}, 'hide');
    assert.equal(product.status, 'hidden');
    await publicState(false);
    await update({}, 'restore');
    assert.equal(product.status, 'draft');
    assert.equal(product.price, '90071992547409.91');
    assert.equal(product.currency, 'EUR');
    await publicState(false);
    await update({ status: 'published' });
    assert.equal(product.status, 'published');
    await publicState(true);
  });

  await step('exactly one native CMS audit event exists per successful mutation', async () => {
    const auditEvents = await events();
    assert.equal(auditEvents.length, product.version);
    assert.equal(product.version, 9);
    assert.deepEqual(auditEvents.map(event => event.action), ['catalog.product.create', 'catalog.product.update', 'catalog.product.update', 'catalog.product.update', 'catalog.product.update', 'catalog.product.update', 'catalog.product.hide', 'catalog.product.restore', 'catalog.product.update']);
    for (const event of auditEvents) {
      assert.equal(event.actor_user_id, null);
      assert.equal(event.organization_id, null);
      assert.equal(event.event_metadata.source, 'cms');
      assert.equal(event.event_metadata.cms_admin_id, adminId);
    }
  });
  console.log(JSON.stringify({ result: 'passed', checks: completed.length, product_id: product.id, public_key: key, final_version: product.version, browser_checks: 'not run by this HTTP-only verifier' }));
} finally {
  await context.dispose();
  await db.end();
}
