import { error } from '@sveltejs/kit';
import body from '$lib/content/excerpt.html?raw';
export const load = ({ params }: any) => {
  if (params.slug !== 'sugowlee') error(404, 'Excerpt not found');
  return { body };
};
