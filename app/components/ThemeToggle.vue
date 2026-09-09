<template>
  <ClientOnly>
    <UButton :icon="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" color="neutral" variant="ghost" size="sm"
      :square="true" :aria-label="isDark ? 'Switch to bright mode' : 'Switch to dark mode'" @click="toggle" />
    <template #fallback>
      <UButton icon="i-lucide-moon" color="neutral" variant="ghost" size="sm" :square="true" disabled />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
// Wraps @nuxtjs/color-mode (bundled with Nuxt UI). `preference` persists to
// localStorage; `value` is the resolved theme, so a tap flips to the opposite
// of what is currently shown regardless of whether the source was `system`.
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === 'dark');

function toggle() {
  colorMode.preference = isDark.value ? 'light' : 'dark';
}
</script>
