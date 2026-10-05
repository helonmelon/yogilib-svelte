import { error, redirect } from '@sveltejs/kit';
import { api } from '$lib/client/api';
export const load = async ({ parent, fetch, params }: any) => {
  const { session } = await parent();
  if (!session.user) redirect(303, '/login');
  if (session.user.role !== 'admin') error(403, 'Forbidden');
  return { doc: await api('documents/' + params.id, {}, fetch) };
};
