import type { Handle } from '@sveltejs/kit';
import { createHash, timingSafeEqual } from 'node:crypto';

// A hosted preview is private: one shared password (HTTP Basic auth) guards every page.
// Health checks stay open so the host can tell the server is up.
function previewGate(request: Request, pathname: string) {
  const password = process.env.YOGILIB_PREVIEW_PASSWORD || '';
  if (pathname === '/healthz') return null;
  if (
    process.env.YOGILIB_REQUIRE_PREVIEW_PASSWORD === '1' &&
    password.length < 8
  )
    return new Response(
      'Preview password is not configured (YOGILIB_PREVIEW_PASSWORD, 8+ characters).',
      { status: 503 },
    );
  if (!password) return null;
  const header = request.headers.get('authorization') || '';
  let given = '';
  if (header.startsWith('Basic ')) {
    const decoded = Buffer.from(header.slice(6), 'base64').toString();
    given = decoded.slice(decoded.indexOf(':') + 1);
  }
  const digest = (v: string) => createHash('sha256').update(v).digest();
  if (timingSafeEqual(digest(given), digest(password))) return null;
  return new Response('Yogilib preview: sign in with the preview password.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Yogilib preview", charset="UTF-8"',
      'Cache-Control': 'no-store',
    },
  });
}

export const handle: Handle = async ({ event, resolve }) => {
  const gated = previewGate(event.request, event.url.pathname);
  if (gated) return gated;
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
