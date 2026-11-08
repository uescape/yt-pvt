import preact from '@preact/preset-vite';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

/** TV browsers before Chromium 61 (Tizen 4, webOS 4) can't run ES modules: emit a classic deferred script. */
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html.replace(/<script type="module" crossorigin/g, '<script defer').replace(/ crossorigin(?=[ >])/g, '');
    },
  };
}

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  plugins: [preact(), classicScript()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  // Relative asset paths: the same build works hosted at https://your-domain/ and packaged inside a TV app.
  base: './',
  build: {
    // Tizen 4 (2018 Samsung TVs) ships Chromium 56; webOS 4 (2018 LG TVs) ships Chromium 53.
    target: 'es2015',
    cssTarget: 'chrome53',
    modulePreload: false,
    assetsInlineLimit: 8192,
    sourcemap: true,
    rollupOptions: {
      output: { format: 'iife', inlineDynamicImports: true },
    },
  },
  server: {
    port: 5173,
    proxy: { '/v1': 'http://127.0.0.1:8787' },
  },
  test: {
    environment: 'jsdom',
  },
});
