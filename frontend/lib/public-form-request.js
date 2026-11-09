export function publicFormRequestError(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const url = new URL(request.url);
  if (!origin || (origin !== url.origin && origin !== `${url.protocol}//${host}`)) return 403;
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return 415;
  return null;
}

export async function readPublicFormJson(request, maxBodyBytes) {
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
