import { error } from '@sveltejs/kit';
import about from '$lib/content/about.html?raw';
import works from '$lib/content/works.html?raw';
import mission from '$lib/content/mission.html?raw';
import similar from '$lib/content/similar.html?raw';
const pages: Record<string, { title: string; html: string }> = {
  about: { title: 'About', html: about },
  works: { title: 'Works', html: works },
  mission: { title: 'Mission', html: mission },
  similar: { title: 'Resources', html: similar },
  store: {
    title: 'Store',
    html: '<p>Books and materials published or curated by Yogilib.</p>',
  },
};
export const load = ({ params }: any) => {
  if (!pages[params.info]) error(404, 'Page not found');
  return { ...pages[params.info], kind: params.info };
};
