import { publicFormRequestError, readPublicFormJson } from '../../../lib/public-form-request.js';

const webhookPath = /^(\/rest\/\d+\/[a-z\d_-]+)\/?(?:\/crm\.item\.add(?:\.json)?)?$/i;

function getLeadEndpoint() {
  try {
    const url = new URL(process.env.BITRIX24_WEBHOOK_URL?.trim());
    const path = webhookPath.exec(url.pathname);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !path) return null;
    url.pathname = `${path[1]}/crm.item.add.json`;
    return url;
  } catch {
    return null;
  }
}

function failure(status) {
  return Response.json({ sent: false }, { status });
}

export async function POST(request) {
  const requestError = publicFormRequestError(request);
  if (requestError) return failure(requestError);

  const feedback = await readPublicFormJson(request, 2048);
  if (!feedback || feedback.website !== '') return failure(400);
  const name = typeof feedback.name === 'string' ? feedback.name.trim() : '';
  const rawPhone = typeof feedback.phone === 'string' ? feedback.phone.trim() : '';
  const phone = rawPhone.replace(/[\s().-]/g, '');
  if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name) ||
      rawPhone.length > 40 || !/^\+?\d{7,15}$/.test(phone)) return failure(400);

  const endpoint = getLeadEndpoint();
  if (!endpoint) return failure(503);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entityTypeId: 1,
        fields: {
          title: 'Обратная связь с сайта Alageum Electric',
          name,
          sourceDescription: 'Кнопка «Обратная связь»',
          fm: [{ typeId: 'PHONE', valueType: 'WORK', value: phone }],
        },
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429) return failure(429);
    if (!response.ok) return failure(502);

    const result = await response.json();
    if (result?.error || !(Number(result?.result?.item?.id) > 0)) return failure(502);
    return Response.json({ sent: true });
  } catch {
    return failure(502);
  }
}
