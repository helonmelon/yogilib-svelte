import { redirect } from '@sveltejs/kit';
import { api, APIError } from '$lib/client/api';
export const load = async ({ fetch, url, parent }: any) => {
  const { session } = await parent();
  if (!session.user) redirect(303, '/login');
  try {
    return {
      ...(await api('documents?' + url.searchParams.toString(), {}, fetch)),
      query: url.searchParams.get('q') || '',
      category: url.searchParams.get('cat') || 'सबै',
    };
  } catch (e) {
    if (session.offline) redirect(303, '/downloads');
    if (e instanceof APIError && e.status === 401) redirect(303, '/login');
    throw e;
  }
};
