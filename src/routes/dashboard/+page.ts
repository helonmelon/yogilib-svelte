import { error, redirect } from '@sveltejs/kit';
import { api } from '$lib/client/api';
export const load = async ({ fetch, url, parent }: any) => {
  const { session } = await parent();
  if (!session.user) redirect(303, '/login');
  if (session.user.role !== 'admin') error(403, 'Forbidden');
  return {
    ...(await api('documents?' + url.searchParams.toString(), {}, fetch)),
    query: url.searchParams.get('q') || '',
    category: url.searchParams.get('cat') || 'सबै',
  };
};
