import { isDesignLabPath } from './utils/designLab';

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  ssr: false,
  modules: ['@nuxt/ui'],

  hooks: {
    // Keep the design-lab pages out of production: they are ~1.5k lines of mockup plus ~43KB of CSS
    // that would otherwise ship to every user and sit in the client route manifest.
    // Set INCLUDE_DESIGN_LAB=1 to build them anyway.
    'pages:extend'(pages) {
      if (process.env.NODE_ENV !== 'production' || process.env.INCLUDE_DESIGN_LAB) return;
      const strip = (list: any[]) => {
        for (let i = list.length - 1; i >= 0; i--) {
          const page = list[i];
          if (isDesignLabPath(page.path)) {
            list.splice(i, 1);
            continue;
          }
          if (page.children?.length) strip(page.children);
        }
      };
      strip(pages);
    },
  },

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
    // No `mode: 'out-in'`. That made the outgoing page finish its leave transition before the
    // incoming page began entering, and that delay was serial with the data fetch rather than
    // concurrent with it — 200-400ms of dead time per navigation. See .context/perf-plan.md item 4.
    pageTransition: { name: 'page' },
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

  // Bundle the lucide collection into the CLIENT. `ssr: false`, so serverBundle is never consulted
  // for first paint — without this, every distinct icon name is fetched from the Iconify API in the
  // browser on the user's connection. See .context/perf-plan.md item 2.
  //
  // `scan` picks up statically-written `i-lucide-*` strings, but it cannot see names that only ever
  // arrive through a binding (`:icon="option.icon"` from PRIORITY_OPTIONS, BottomNav items, the
  // priority/status pickers). Those would silently render blank, so the full set is listed
  // explicitly below. All 89 verified present in @iconify-json/lucide.
  //
  // To refresh after adding an icon:
  //   grep -rhoE "i-lucide-[a-z0-9-]+" app/ --exclude-dir=node_modules | sed 's/^i-lucide-/lucide:/' | sort -u
  icon: {
    clientBundle: {
      scan: true,
      icons: [
        'lucide:alert-circle', 'lucide:alert-triangle', 'lucide:archive', 'lucide:archive-restore',
        'lucide:arrow-down', 'lucide:arrow-down-left', 'lucide:arrow-left', 'lucide:arrow-right',
        'lucide:arrow-up', 'lucide:arrow-up-right', 'lucide:book-heart', 'lucide:book-open',
        'lucide:calendar', 'lucide:calendar-clock', 'lucide:calendar-days', 'lucide:calendar-range',
        'lucide:calendar-x', 'lucide:check', 'lucide:check-circle-2', 'lucide:chevron-down',
        'lucide:chevron-left', 'lucide:chevron-right', 'lucide:chevron-up', 'lucide:chevrons-down',
        'lucide:chevrons-left', 'lucide:chevrons-right', 'lucide:chevrons-up', 'lucide:circle',
        'lucide:circle-alert', 'lucide:circle-check', 'lucide:circle-dashed', 'lucide:circle-dot',
        'lucide:circle-slash', 'lucide:circle-x', 'lucide:clock', 'lucide:cookie',
        'lucide:copy', 'lucide:copy-check', 'lucide:ellipsis', 'lucide:external-link',
        'lucide:eye', 'lucide:eye-off', 'lucide:file', 'lucide:file-plus',
        'lucide:file-text', 'lucide:files', 'lucide:flag', 'lucide:flame',
        'lucide:focus', 'lucide:folder', 'lucide:folder-open', 'lucide:grip-vertical',
        'lucide:hash', 'lucide:info', 'lucide:key', 'lucide:layers',
        'lucide:lightbulb', 'lucide:list', 'lucide:list-checks', 'lucide:loader-2',
        'lucide:loader-circle', 'lucide:lock', 'lucide:log-out', 'lucide:menu',
        'lucide:minus', 'lucide:monitor', 'lucide:moon', 'lucide:panel-left-close',
        'lucide:panel-left-open', 'lucide:pencil', 'lucide:pin', 'lucide:pin-off',
        'lucide:plus', 'lucide:rotate-ccw', 'lucide:search', 'lucide:settings-2',
        'lucide:sliders-horizontal', 'lucide:sparkles', 'lucide:square', 'lucide:sun',
        'lucide:tags', 'lucide:target', 'lucide:trash-2', 'lucide:triangle-alert',
        'lucide:upload', 'lucide:user', 'lucide:user-plus', 'lucide:users',
        'lucide:x',
      ],
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
