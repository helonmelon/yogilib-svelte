import { error, redirect } from '@sveltejs/kit';
export const load = async ({ parent }: any) => {
  const { session } = await parent();
  if (!session.user) redirect(303, '/login');
  if (!['uploader', 'admin'].includes(session.user.role))
    error(403, 'Forbidden');
  return {};
};
