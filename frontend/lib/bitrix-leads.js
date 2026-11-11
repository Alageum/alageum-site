import { randomUUID } from 'node:crypto';

const originator = 'alageum-site';
const pendingSubmissions = new Map();
const webhookPath = /^(\/rest\/\d+\/[a-z\d_-]+)\/?(?:\/crm\.(?:item|lead)\.add(?:\.json)?)?$/i;

export class BitrixError extends Error {
  constructor(status) {
    super('CRM request failed');
    this.status = status;
  }
}

function webhookBase() {
  try {
    const url = new URL(process.env.BITRIX24_WEBHOOK_URL?.trim());
    const match = webhookPath.exec(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !match) throw new Error();
    url.pathname = match[1] + '/';
    return url;
  } catch {
    throw new BitrixError(503);
  }
}

async function callCrm(base, method, body) {
  try {
    const response = await fetch(new URL(method + '.json', base), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429) throw new BitrixError(429);
    if (!response.ok) throw new BitrixError(502);
    const result = await response.json();
    if (Object.hasOwn(result, 'error') || result.result === undefined) throw new BitrixError(502);
    return result.result;
  } catch (error) {
    if (error instanceof BitrixError) throw error;
    throw new BitrixError(502);
  }
}

function recordId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id < 1) throw new BitrixError(502);
  return id;
}

async function saveSubmission(base, submission, id) {
  const originId = 'form-' + id;
  const leads = await callCrm(base, 'crm.lead.list', {
    filter: { '=ORIGINATOR_ID': originator, '=ORIGIN_ID': originId },
    select: ['ID'],
  });
  if (!Array.isArray(leads)) throw new BitrixError(502);

  const comment = [
    submission.title,
    'Имя при обращении: ' + submission.name,
    submission.page ? 'Страница: ' + submission.page : '',
    submission.message,
    '[site:' + id + ']',
  ].filter(Boolean).join('\n');

  let leadId;
  if (leads.length) {
    leadId = recordId(leads[0].ID);
    const entries = await callCrm(base, 'crm.timeline.comment.list', {
      filter: { ENTITY_ID: leadId, ENTITY_TYPE: 'lead' },
      select: ['ID', 'COMMENT'],
    });
    if (!Array.isArray(entries)) throw new BitrixError(502);
    if (entries.some(entry => entry.COMMENT?.includes('[site:' + id + ']'))) return;
  } else {
    const communication = submission.phone
      ? { type: 'PHONE', values: [submission.phone] }
      : { type: 'EMAIL', values: [submission.email] };
    const matches = await callCrm(base, 'crm.duplicate.findbycomm', {
      entity_type: 'CONTACT',
      ...communication,
    });
    let contactId;
    if (matches?.CONTACT?.length) {
      contactId = recordId(matches.CONTACT[0]);
    } else {
      contactId = recordId(await callCrm(base, 'crm.contact.add', {
        fields: {
          NAME: submission.name,
          ...(submission.phone && { PHONE: [{ VALUE: submission.phone, VALUE_TYPE: 'WORK' }] }),
          ...(submission.email && { EMAIL: [{ VALUE: submission.email, VALUE_TYPE: 'WORK' }] }),
          SOURCE_ID: 'ADVERTISING',
          ORIGINATOR_ID: originator,
          ORIGIN_ID: originId,
        },
      }));
    }
    leadId = recordId(await callCrm(base, 'crm.lead.add', {
      fields: {
        TITLE: submission.title,
        CONTACT_ID: contactId,
        SOURCE_ID: 'ADVERTISING',
        SOURCE_DESCRIPTION: submission.page || 'Сайт Alageum Electric',
        ORIGINATOR_ID: originator,
        ORIGIN_ID: originId,
      },
    }));
  }

  recordId(await callCrm(base, 'crm.timeline.comment.add', {
    fields: { ENTITY_ID: leadId, ENTITY_TYPE: 'lead', COMMENT: comment },
  }));
}

export async function createBitrixLead(submission) {
  const base = webhookBase();
  const id = submission.id || randomUUID().replaceAll('-', '');
  const key = base.href + id;
  if (pendingSubmissions.has(key)) return pendingSubmissions.get(key);
  const task = saveSubmission(base, submission, id);
  pendingSubmissions.set(key, task);
  try {
    await task;
  } finally {
    pendingSubmissions.delete(key);
  }
}

export function submissionPage(value, requestUrl) {
  if (value === undefined || value === '') return '';
  if (typeof value !== 'string' || value.length > 500 || !value.startsWith('/') || value.startsWith('//')) return null;
  try {
    const page = new URL(value, requestUrl);
    return page.origin === new URL(requestUrl).origin ? page.origin + page.pathname : null;
  } catch {
    return null;
  }
}
