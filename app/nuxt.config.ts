export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: false,
  modules: ['@nuxt/ui'],

  app: {
    head: {
      title: 'daybook',
      meta: [
        { name: 'viewport', content: 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover' },
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
        { name: 'theme-color', content: '#171716' },
      ],
      link: [
        { rel: 'manifest', href: '/manifest.json' },
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/daybook-mark-32.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/daybook-mark-180.png' },
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
      colors: ['primary', 'secondary', 'neutral', 'error', 'warning', 'success', 'info'],
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
