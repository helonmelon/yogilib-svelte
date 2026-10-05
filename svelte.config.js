import node from '@sveltejs/adapter-node';
import staticAdapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter:
      process.env.MOBILE_BUILD === '1'
        ? staticAdapter({
            pages: 'mobile-dist',
            assets: 'mobile-dist',
            fallback: 'index.html',
            strict: false,
          })
        : node(),
    csrf: { trustedOrigins: ['capacitor://localhost', 'https://localhost'] },
  },
};
