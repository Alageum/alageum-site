const salesEmail = 'sales@alageum.com';
const emailPattern = /^[^\s@<>,;:"()[\]\\]+@[^\s@<>,;:"()[\]\\]+\.[^\s@<>,;:"()[\]\\]+$/;
const maxBodyBytes = 12 * 1024;
const submissionIdPattern = /^[0-9a-f]{32}$/;

function failure(status) {
  return Response.json({ sent: false }, { status });
}

async function readContact(request) {
  if (!request.body || Number(request.headers.get('content-length')) > maxBodyBytes) return null;
  const reader = request.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let size = 0;
  let raw = '';
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBodyBytes) {
        await reader.cancel();
        return null;
      }
      raw += decoder.decode(value, { stream: true });
    }
    return JSON.parse(raw + decoder.decode());
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

export async function POST(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const url = new URL(request.url);
  if (!origin || (origin !== url.origin && origin !== `${url.protocol}//${host}`)) return failure(403);
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return failure(415);

  const contact = await readContact(request);
  if (!contact || contact.website !== '' || typeof contact.id !== 'string' || !submissionIdPattern.test(contact.id)) return failure(400);
  const name = typeof contact.name === 'string' ? contact.name.trim() : '';
  const email = typeof contact.email === 'string' ? contact.email.trim() : '';
  const message = typeof contact.message === 'string' ? contact.message.trim() : '';
  if (!name || name.length > 120 || /[\x00-\x1f\x7f]/.test(name) ||
      email.length > 254 || /[\x00-\x1f\x7f]/.test(email) || !emailPattern.test(email) ||
      !message || message.length > 1000 || message.includes('\0')) return failure(400);

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.ALAGEUM_CONTACT_FROM?.trim();
  if (!apiKey || !from) return failure(503);

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `home-contact/${contact.id}`,
      },
      body: JSON.stringify({
        from,
        to: [salesEmail],
        reply_to: email,
        subject: 'Обращение с сайта Alageum Electric',
        text: `Имя: ${name}\nEmail: ${email}\n\n${message}`,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 429) return failure(429);
    if (!response.ok) {
      console.error('Contact email rejected by provider', response.status);
      return failure(502);
    }
    const result = await response.json();
    if (typeof result?.id !== 'string' || !result.id) return failure(502);
    return Response.json({ sent: true });
  } catch {
    console.error('Contact email provider request failed');
    return failure(502);
  }
}
