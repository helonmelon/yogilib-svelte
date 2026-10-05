const browser = typeof window !== 'undefined';
export class APIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const apiBase = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export function assetURL(path: string) {
  return /^(https?:|blob:|data:)/.test(path) ? path : apiBase + path;
}
export async function api<T = any>(
  path: string,
  options: RequestInit = {},
  fetcher: typeof fetch = fetch,
): Promise<T> {
  const r = await fetcher(apiBase + '/api/' + path, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body && !(options.body instanceof FormData)
        ? { 'Content-Type': 'application/json' }
        : {}),
      ...options.headers,
    },
  });
  if (!r.ok) {
    let message = 'Could not connect to the archive';
    try {
      message = (await r.json()).error || message;
    } catch {}
    throw new APIError(r.status, message);
  }
  return r.json();
}
export const send = (path: string, body: any, method = 'POST') =>
  api(path, { method, body: JSON.stringify(body) });
export async function getSession(fetcher: typeof fetch) {
  try {
    const s = await api('session', {}, fetcher);
    if (browser) localStorage.setItem('yogilib-identity', JSON.stringify(s));
    return { ...s, offline: false };
  } catch (e) {
    if (browser && !(e instanceof APIError)) {
      try {
        const s = JSON.parse(
          localStorage.getItem('yogilib-identity') || 'null',
        );
        if (s) return { ...s, offline: true };
      } catch {}
    }
    throw e;
  }
}
