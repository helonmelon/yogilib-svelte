import { api } from '$lib/client/api';
export const load = async ({ fetch, url }: any) => {
  const before = url.searchParams.get('before');
  return api(
    'journal' + (before ? '?before=' + encodeURIComponent(before) : ''),
    {},
    fetch,
  );
};
