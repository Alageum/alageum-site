import { createBitrixLead, submissionPage } from '../../../lib/bitrix-leads.js';
import { publicFormRequestError, readPublicFormJson } from '../../../lib/public-form-request.js';

function failure(status) {
  return Response.json({ sent: false }, { status });
}

export async function POST(request) {
  const requestError = publicFormRequestError(request);
  if (requestError) return failure(requestError);

  const feedback = await readPublicFormJson(request, 8 * 1024);
  if (!feedback || feedback.website !== '') return failure(400);
  const name = typeof feedback.name === 'string' ? feedback.name.trim() : '';
  const rawPhone = typeof feedback.phone === 'string' ? feedback.phone.trim() : '';
  const phone = rawPhone.replace(/[\s().-]/g, '');
  const comment = feedback.comment ?? '';
  if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name) ||
      rawPhone.length > 40 || !/^\+?\d{7,15}$/.test(phone) ||
      typeof comment !== 'string' || comment.length > 1000 || comment.includes('\0')) return failure(400);
  const page = submissionPage(feedback.page, request.url);
  if (page === null || (feedback.id !== undefined && (typeof feedback.id !== 'string' || !/^[a-f0-9]{32}$/.test(feedback.id)))) return failure(400);

  try {
    await createBitrixLead({
      id: feedback.id,
      name,
      phone,
      message: comment.trim(),
      page,
      title: 'Обратная связь с сайта Alageum Electric',
    });
    return Response.json({ sent: true });
  } catch (error) {
    return failure(error.status || 502);
  }
}
