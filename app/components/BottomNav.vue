<template>
  <div class="calm-bottom-nav-wrap fixed bottom-0 left-0 right-0 z-50">
    <nav class="calm-bottom-nav" aria-label="Primary navigation">
      <div class="grid grid-cols-4 gap-1">
        <NuxtLink v-for="item in navItems" :key="item.to" :to="item.to"
          class="calm-bottom-nav-link flex flex-col items-center justify-center gap-1"
          :class="isActive(item.to) && 'is-active'">
          <UIcon :name="item.icon" class="size-5" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();

const navItems = [
  { to: '/diary', label: 'Today', icon: 'i-lucide-book-open' },
  { to: '/tasks', label: 'Tasks', icon: 'i-lucide-check-circle-2' },
  { to: '/notes', label: 'Notes', icon: 'i-lucide-file-text' },
  { to: '/settings', label: 'Settings', icon: 'i-lucide-settings-2' },
];

function isActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`);
}
</script>
