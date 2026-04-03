export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: false,
  modules: ['@nuxtjs/tailwindcss'],

  app: {
    head: {
      title: 'rc-notes',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#18181b' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  tailwindcss: {
    configPath: './tailwind.config.ts',
  },

  nitro: {
    esbuild: {
      options: {
        target: 'esnext',
      },
    },
    externals: {
      inline: [],
    },
    rollupConfig: {
      external: ['@duckdb/node-api'],
    },
  },

  devtools: { enabled: false },
})
