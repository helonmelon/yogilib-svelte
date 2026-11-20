// Liveness check for hosting platforms. Does not touch the database.
export const GET = () =>
  new Response('ok', { headers: { 'Cache-Control': 'no-store' } });
