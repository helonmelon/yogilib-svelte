import { api } from '$lib/client/api';
export const load = async ({ fetch }: any) => {
  try {
    return await api<{ providers: { id: string; label: string; region: string; currencies: string[] }[] }>(
      'payments/providers',
      {},
      fetch,
    );
  } catch {
    return { providers: [] };
  }
};
