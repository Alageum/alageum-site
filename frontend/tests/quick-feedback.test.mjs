import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/feedback/route.js';

const valid = { name: ' Алия ', phone: '+7 (700) 000-00-00', website: '' };

function submit(data = valid, origin = 'https://site.example.test') {
  return POST(new Request('https://site.example.test/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(data),
  }));
}

test('feedback sends a CRM lead and confirms only a successful creation', async (t) => {
  const previous = process.env.BITRIX24_WEBHOOK_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.BITRIX24_WEBHOOK_URL;
    else process.env.BITRIX24_WEBHOOK_URL = previous;
  });

  delete process.env.BITRIX24_WEBHOOK_URL;
  assert.equal((await submit()).status, 503);
  process.env.BITRIX24_WEBHOOK_URL = 'https://crm.example.test/rest/1/fake-token/';
  let providerResponse = { result: { item: { id: 42 } } };
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => Response.json(providerResponse));

  for (const data of [
    { ...valid, name: ' ' }, { ...valid, phone: 'no phone' },
    { ...valid, website: 'autofilled' }, { ...valid, name: 'а'.repeat(2048) },
    { ...valid, comment: 123 }, { ...valid, comment: 'ә'.repeat(1001) },
  ]) assert.equal((await submit(data)).status, 400);
  assert.equal((await submit(valid, 'https://elsewhere.example.test')).status, 403);
  assert.equal(fetchMock.mock.callCount(), 0);

  const response = await submit();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sent: true });
  const [endpoint, request] = fetchMock.mock.calls[0].arguments;
  assert.equal(endpoint.href, 'https://crm.example.test/rest/1/fake-token/crm.item.add.json');
  assert.equal(request.method, 'POST');
  const { entityTypeId, fields } = JSON.parse(request.body);
  assert.equal(entityTypeId, 1);
  assert.equal(fields.name, 'Алия');
  assert.deepEqual(fields.fm, [{ typeId: 'PHONE', valueType: 'WORK', value: '+77000000000' }]);
  assert.equal(fields.comments, undefined);

  const comment = 'Нужна консультация.\nУдобно после 15:00.';
  assert.equal((await submit({ ...valid, comment: ` ${comment} ` })).status, 200);
  assert.equal(JSON.parse(fetchMock.mock.calls[1].arguments[1].body).fields.comments, comment);
  assert.equal((await submit({ ...valid, comment: 'ә'.repeat(1000) })).status, 200);

  providerResponse = { error: 'ACCESS_DENIED' };
  const rejected = await submit();
  assert.equal(rejected.status, 502);
  assert.deepEqual(await rejected.json(), { sent: false });
});
