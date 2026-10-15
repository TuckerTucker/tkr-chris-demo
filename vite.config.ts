import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const buildId = randomUUID();
// Bump when a storage migration cannot safely coexist with the previous client.
const schemaCompatibility = 1;

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(buildId),
    'import.meta.env.VITE_APP_SCHEMA_VERSION': JSON.stringify(schemaCompatibility),
  },
  plugins: [
    preact(),
    {
      name: 'golf-update-coordinator',
      generateBundle() {
        const source = readFileSync(new URL('./src/app/sw-coordinator.js', import.meta.url), 'utf8')
          .replace('__GOLF_BUILD_ID__', buildId).replace('__GOLF_SCHEMA_VERSION__', String(schemaCompatibility));
        this.emitFile({ type: 'asset', fileName: 'sw-coordinator.js', source });
      },
    },
    VitePWA({
      manifest: false,
      registerType: 'prompt',
      injectRegister: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webmanifest}'],
        skipWaiting: false,
        clientsClaim: true,
        cleanupOutdatedCaches: false,
        cacheId: `golf-scorecard-${buildId}`,
        importScripts: ['sw-coordinator.js'],
        navigateFallback: 'index.html',
        runtimeCaching: [{
          urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith('/assets/'),
          handler: async ({ request }) => {
            for (const name of await caches.keys()) {
              if (!name.startsWith('golf-scorecard-')) continue;
              const response = await (await caches.open(name)).match(request, { ignoreSearch: true });
              if (response) return response;
            }
            return fetch(request);
          },
        }],
      },
    }),
  ],
});
