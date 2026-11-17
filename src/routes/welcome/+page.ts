import { redirect } from '@sveltejs/kit';
export const load = async ({ parent }: any) => {
  const { session } = await parent();
  if (!session.user) redirect(303, '/join');
  return {};
};
