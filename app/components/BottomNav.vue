<template>
  <nav class="fixed bottom-0 left-0 right-0 safe-bottom z-50" style="background-color:#27272a; border-top: 1px solid #3f3f46;">
    <div class="flex items-center justify-around h-16 max-w-lg mx-auto">
      <NuxtLink v-for="item in items" :key="item.to" :to="item.to"
        class="flex flex-col items-center justify-center min-w-[64px] h-full text-[11px] font-medium tracking-wide transition-all duration-200"
        :class="isActive(item.to) ? 'accent-text' : 'text-faint'">
        <div class="relative">
          <svg class="w-6 h-6 transition-transform duration-200" :class="isActive(item.to) && 'scale-110'" fill="none" stroke="currentColor" :stroke-width="isActive(item.to) ? 2 : 1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" :d="item.icon" />
          </svg>
          <div v-if="isActive(item.to)" class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full accent-bg" />
        </div>
        <span class="mt-1">{{ item.label }}</span>
      </NuxtLink>
    </div>
  </nav>
</template>

<script setup lang="ts">
const route = useRoute();
const items = [
  { to: '/', label: 'Tasks', icon: 'M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
  { to: '/notes', label: 'Notes', icon: 'M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z' },
  { to: '/calendar', label: 'Calendar', icon: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5' },
  { to: '/search', label: 'Search', icon: 'm21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z' },
];
function isActive(path: string) { if (path === '/') return route.path === '/'; return route.path.startsWith(path); }
</script>
