// Process liveness only. Database, storage and scanner readiness belong to the
// backend readiness endpoint; a running frontend must not imply they are ready.
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json({ status: 'ok', service: 'frontend', check: 'liveness' }, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function HEAD() {
  return new Response(null, { headers: { 'Cache-Control': 'no-store' } });
}
