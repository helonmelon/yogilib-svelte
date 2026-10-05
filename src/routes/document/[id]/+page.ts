import { browser } from '$app/environment';
import { api, APIError } from '$lib/client/api';
import { getCached } from '$lib/client/offline';
import { error } from '@sveltejs/kit';
export const load = async ({ params, fetch }: any) => {
  try {
    return {
      doc: await api('documents/' + params.id, {}, fetch),
      fromDownload: false,
    };
  } catch (e) {
    if (browser && !(e instanceof APIError)) {
      const doc = await getCached(params.id);
      if (doc) return { doc, fromDownload: true };
    }
    if (e instanceof APIError) error(e.status, e.message);
    error(
      503,
      'This work is not available offline. Download it while connected.',
    );
  }
};
