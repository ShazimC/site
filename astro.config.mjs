// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { SITE_URL } from './src/lib/site.ts';

// https://astro.build/config
export default defineConfig({
  site: SITE_URL,
  adapter: node({
    mode: 'standalone',
  }),

  integrations: [mdx(), react()],
  markdown: {
    shikiConfig: {
      // Colors are exposed as --shiki-light/--shiki-dark and picked in prose.css.
      themes: { light: 'rose-pine-dawn', dark: 'rose-pine' },
      defaultColor: false,
    },
  },
  server: {
    host: '::', // needed for railway
  },
});
