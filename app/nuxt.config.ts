export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: false,
  modules: ['@nuxt/ui'],

  app: {
    head: {
      title: 'rc-notes',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#042f2e' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
    },
    pageTransition: { name: 'page', mode: 'out-in' },
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark',
  },

  ui: {
    theme: {
      colors: ['teal', 'purple', 'zinc'],
    },
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

  vite: {
    optimizeDeps: {
      include: ['vuedraggable'],
    },
  },

  devtools: { enabled: false },
})
