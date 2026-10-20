<template>
  <div class="calm-page max-w-lg mx-auto px-4 pt-6 pb-16 safe-top">
    <NuxtLink to="/" class="text-sm text-(--ui-text-muted) inline-flex items-center gap-1 min-h-11">
      <UIcon name="i-lucide-arrow-left" class="size-4" /> Daybook
    </NuxtLink>
    <h1 class="text-2xl font-bold tracking-tight mt-2">{{ title }}</h1>
    <p v-if="updated" class="text-xs text-(--ui-text-dimmed) mt-1">Last updated {{ updated }}</p>
    <div class="legal-page prose prose-sm mt-6 max-w-none">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ title: string; updated?: string }>();
useHead({ title: () => `${props.title} · Daybook` });
</script>
