import { api, APIError } from '$lib/client/api';
export const load = async ({ fetch, url, parent }: any) => {
  const { session } = await parent();
  try {
    return {
      ...(await api('documents?' + url.searchParams.toString(), {}, fetch)),
      query: url.searchParams.get('q') || '',
      category: url.searchParams.get('cat') || 'सबै',
    };
  } catch (e) {
    if (session.offline) return { documents: [], total: 0, offset: 0, query: '', category: 'सबै' };
    if (e instanceof APIError && e.status === 401) return { documents: [], total: 0, offset: 0, query: '', category: 'सबै' };
    throw e;
  }
};
