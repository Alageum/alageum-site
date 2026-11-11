import assert from 'node:assert/strict';
import test from 'node:test';
import { POST } from '../app/api/feedback/route.js';

const valid = {
  id: 'a'.repeat(32), name: ' Алия ', phone: '+7 (700) 000-00-00',
  website: '', page: '/manufacturers', comment: 'Нужен паспорт оборудования.',
};

function submit(data = valid, origin = 'https://site.example.test') {
  return POST(new Request('https://site.example.test/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify(data),
  }));
}

test('feedback links contact and lead, sets advertising source and adds timeline comment', async (t) => {
  const previous = process.env.BITRIX24_WEBHOOK_URL;
  t.after(() => {
    if (previous === undefined) delete process.env.BITRIX24_WEBHOOK_URL;
    else process.env.BITRIX24_WEBHOOK_URL = previous;
  });

  delete process.env.BITRIX24_WEBHOOK_URL;
  assert.equal((await submit()).status, 503);
  process.env.BITRIX24_WEBHOOK_URL = 'https://crm.example.test/rest/1/fake-token/';

  const calls = [];
  let leadExists = false;
  let commentExists = false;
  let contactExists = false;
  let failTimeline = false;
  let denyRead = false;
  const fetchMock = t.mock.method(globalThis, 'fetch', async (endpoint, options) => {
    assert.equal(options.method, 'POST');
    const method = endpoint.pathname.split('/').at(-1);
    const body = JSON.parse(options.body);
    calls.push({ method, body });
    if (denyRead) return Response.json({ error: '', error_description: 'Access denied.' });
    switch (method) {
      case 'crm.lead.list.json':
        assert.deepEqual(body.filter, { '=ORIGINATOR_ID': 'alageum-site', '=ORIGIN_ID': 'form-' + valid.id });
        return Response.json({ result: leadExists ? [{ ID: '42' }] : [] });
      case 'crm.duplicate.findbycomm.json':
        assert.deepEqual(body, { entity_type: 'CONTACT', type: 'PHONE', values: ['+77000000000'] });
        return Response.json({ result: contactExists ? { CONTACT: [17] } : [] });
      case 'crm.contact.add.json':
        contactExists = true;
        return Response.json({ result: 17 });
      case 'crm.lead.add.json':
        leadExists = true;
        return Response.json({ result: 42 });
      case 'crm.timeline.comment.list.json':
        return Response.json({ result: commentExists ? [{ ID: 81, COMMENT: '[site:' + valid.id + ']' }] : [] });
      case 'crm.timeline.comment.add.json':
        if (failTimeline) return Response.json({ error: 'ACCESS_DENIED' });
        commentExists = true;
        return Response.json({ result: 81 });
      default:
        throw new Error('Unexpected method ' + method);
    }
  });

  for (const data of [
    { ...valid, name: ' ' }, { ...valid, phone: 'no phone' },
    { ...valid, website: 'autofilled' }, { ...valid, name: 'а'.repeat(2048) },
    { ...valid, comment: 123 }, { ...valid, comment: 'ә'.repeat(1001) },
    { ...valid, id: 'bad' }, { ...valid, page: 'https://elsewhere.example.test/' },
  ]) assert.equal((await submit(data)).status, 400);
  assert.equal((await submit(valid, 'https://elsewhere.example.test')).status, 403);
  assert.equal(fetchMock.mock.callCount(), 0);

  assert.deepEqual(await (await submit()).json(), { sent: true });
  assert.deepEqual(calls.map(call => call.method), [
    'crm.lead.list.json', 'crm.duplicate.findbycomm.json',
    'crm.contact.add.json', 'crm.lead.add.json', 'crm.timeline.comment.add.json',
  ]);
  const contact = calls[2].body.fields;
  assert.equal(contact.NAME, 'Алия');
  assert.deepEqual(contact.PHONE, [{ VALUE: '+77000000000', VALUE_TYPE: 'WORK' }]);
  assert.equal(calls[3].body.fields.CONTACT_ID, 17);
  assert.equal(calls[3].body.fields.SOURCE_ID, 'ADVERTISING');
  assert.equal(calls[3].body.fields.PHONE, undefined);
  const timeline = calls[4].body.fields;
  assert.equal(timeline.ENTITY_ID, 42);
  assert.equal(timeline.ENTITY_TYPE, 'lead');
  assert.ok(timeline.COMMENT.includes(valid.comment));
  assert.ok(timeline.COMMENT.includes('https://site.example.test/manufacturers'));

  calls.length = 0;
  assert.equal((await submit()).status, 200);
  assert.deepEqual(calls.map(call => call.method), ['crm.lead.list.json', 'crm.timeline.comment.list.json']);

  leadExists = false;
  commentExists = false;
  failTimeline = true;
  calls.length = 0;
  assert.equal((await submit()).status, 502);
  assert.ok(!calls.some(call => call.method === 'crm.contact.add.json'));
  failTimeline = false;
  calls.length = 0;
  assert.equal((await submit()).status, 200);
  assert.deepEqual(calls.map(call => call.method), [
    'crm.lead.list.json', 'crm.timeline.comment.list.json', 'crm.timeline.comment.add.json',
  ]);

  denyRead = true;
  calls.length = 0;
  const rejected = await submit();
  assert.equal(rejected.status, 502);
  assert.deepEqual(await rejected.json(), { sent: false });
  assert.equal(calls.length, 1);
});
