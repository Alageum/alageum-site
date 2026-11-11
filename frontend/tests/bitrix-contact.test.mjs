import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/contact/route.js';

test('message forms save email on a contact and coalesce simultaneous retries', async (t) => {
  const previous = process.env.BITRIX24_WEBHOOK_URL;
  process.env.BITRIX24_WEBHOOK_URL = 'https://crm.example.test/rest/1/fake-token/';
  t.after(() => {
    if (previous === undefined) delete process.env.BITRIX24_WEBHOOK_URL;
    else process.env.BITRIX24_WEBHOOK_URL = previous;
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    const method = url.pathname.split('/').at(-1);
    const body = JSON.parse(options.body);
    calls.push({ method, body });
    const results = {
      'crm.lead.list.json': [],
      'crm.duplicate.findbycomm.json': [],
      'crm.contact.add.json': 11,
      'crm.lead.add.json': 12,
      'crm.timeline.comment.add.json': 13,
    };
    assert(Object.hasOwn(results, method));
    return Response.json({ result: results[method] });
  });
  const values = {
    id: 'b'.repeat(32), website: '', name: 'Инженер',
    email: 'test@example.com', message: 'Нужен габаритный чертёж.',
    page: '/documents',
  };
  function request() {
    return new Request('https://site.example.test/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://site.example.test' },
      body: JSON.stringify(values),
    });
  }
  const responses = await Promise.all([POST(request()), POST(request())]);
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { sent: true });
  }
  assert.equal(calls.length, 5);
  assert.deepEqual(calls[1].body, { entity_type: 'CONTACT', type: 'EMAIL', values: [values.email] });
  assert.deepEqual(calls[2].body.fields.EMAIL, [{ VALUE: values.email, VALUE_TYPE: 'WORK' }]);
  assert.equal(calls[3].body.fields.CONTACT_ID, 11);
  assert.equal(calls[3].body.fields.SOURCE_ID, 'ADVERTISING');
  assert(calls[4].body.fields.COMMENT.includes(values.message));
});
