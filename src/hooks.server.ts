import type { Handle } from '@sveltejs/kit';
export const handle: Handle = async ({ event, resolve }) => {
  const origin = event.request.headers.get('origin');
  const trusted = new Set([
    event.url.origin,
    process.env.PUBLIC_APP_ORIGIN,
    'capacitor://localhost',
    'https://localhost',
  ]);
  if (event.url.pathname.startsWith('/api/')) {
    if (origin && !trusted.has(origin))
      return new Response('Forbidden origin', { status: 403 });
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(event.request.method) &&
      event.request.headers.get('sec-fetch-site') === 'cross-site' &&
      !origin
    )
      return new Response('Forbidden origin', { status: 403 });
    if (
      Number(event.request.headers.get('content-length') || 0) >
      53 * 1024 * 1024
    )
      return new Response('Upload too large', { status: 413 });
  }
  const response = await resolve(event);
  if (
    !event.url.pathname.startsWith('/api/files/') &&
    !event.url.pathname.startsWith('/static/') &&
    !event.url.pathname.startsWith('/_app/') &&
    !event.url.pathname.startsWith('/offline/')
  )
    response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'SAMEORIGIN');
  if (
    event.url.pathname.startsWith('/api/') &&
    !event.url.pathname.startsWith('/api/files/')
  )
    response.headers.set('Cache-Control', 'no-store');
  if (origin && trusted.has(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET,POST,PUT,DELETE,OPTIONS',
    );
    response.headers.append('Vary', 'Origin');
  }
  return response;
};
