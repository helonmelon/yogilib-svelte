import { error, redirect } from '@sveltejs/kit';
import { api } from '$lib/client/api';
export const load = async ({ fetch, url, parent }: any) => {
  const { session } = await parent();
  if (!session.user) redirect(303, '/login');
  if (session.user.role !== 'admin') error(403, 'Forbidden');
  const [list, ledger] = await Promise.all([
    api('documents?' + url.searchParams.toString(), {}, fetch),
    api('ledger', {}, fetch).catch(() => null),
  ]);
  return {
    ...list,
    ledger,
    query: url.searchParams.get('q') || '',
    category: url.searchParams.get('cat') || 'सबै',
  };
};
