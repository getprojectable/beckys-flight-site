// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Hosted on GitHub Pages under a sub-path. Override with SITE_URL / BASE_PATH for other hosts.
const site = process.env.SITE_URL ?? 'https://getprojectable.github.io';
const base = process.env.BASE_PATH ?? '/beckys-flight-site';

export default defineConfig({
  site,
  base,
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
