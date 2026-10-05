import { getSession } from '$lib/client/api';
export const ssr = import.meta.env.VITE_MOBILE !== '1';
export const prerender = false;
export const load = async ({ fetch }: any) => ({
  session: await getSession(fetch),
});
