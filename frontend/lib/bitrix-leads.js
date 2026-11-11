import { randomUUID } from 'node:crypto';

const originator = 'alageum-site';
const pendingSubmissions = new Map();
const submissionStates = new Map();
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

async function saveSubmission(base, submission, id, state) {
  const originId = 'form-' + id;
  const comment = [
    submission.title,
    'Имя при обращении: ' + submission.name,
    submission.page ? 'Страница: ' + submission.page : '',
    submission.message,
    '[site:' + id + ']',
  ].filter(Boolean).join('\n');

  if (!state.contactId) {
    state.contactId = recordId(await callCrm(base, 'crm.contact.add', {
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
  if (!state.leadId) {
    state.leadId = recordId(await callCrm(base, 'crm.lead.add', {
      fields: {
        TITLE: submission.title,
        CONTACT_ID: state.contactId,
        SOURCE_ID: 'ADVERTISING',
        SOURCE_DESCRIPTION: submission.page || 'Сайт Alageum Electric',
        COMMENTS: comment.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('\n', '<br>'),
        ORIGINATOR_ID: originator,
        ORIGIN_ID: originId,
      },
    }));
  }
  if (!state.commentId && !state.timelineSkipped) {
    try {
      state.commentId = recordId(await callCrm(base, 'crm.timeline.comment.add', {
        fields: { ENTITY_ID: state.leadId, ENTITY_TYPE: 'lead', COMMENT: comment },
      }));
    } catch {
      // The full message is already saved in the lead's COMMENTS field.
      state.timelineSkipped = true;
      console.error('Bitrix24 timeline comment unavailable; message retained in lead comments.');
    }
  }
}

export async function createBitrixLead(submission) {
  const base = webhookBase();
  const id = submission.id || randomUUID().replaceAll('-', '');
  const key = base.href + id;
  if (pendingSubmissions.has(key)) return pendingSubmissions.get(key);
  const now = Date.now();
  for (const [storedKey, storedState] of submissionStates) {
    if (storedState.expiresAt <= now) submissionStates.delete(storedKey);
  }
  if (!submissionStates.has(key)) {
    if (submissionStates.size >= 500) submissionStates.delete(submissionStates.keys().next().value);
    submissionStates.set(key, { expiresAt: now + 30 * 60 * 1000 });
  }
  const task = saveSubmission(base, submission, id, submissionStates.get(key));
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
