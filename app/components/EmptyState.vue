<template>
  <div class="flex flex-col items-center justify-center py-16 px-8 text-center">
    <div class="w-20 h-20 rounded-2xl surface-card flex items-center justify-center mb-4">
      <svg class="w-9 h-9 text-faint" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" :d="icon" />
      </svg>
    </div>
    <p class="text-[14px] text-muted leading-relaxed">{{ message }}</p>
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{ message: string; icon?: string }>();
</script>
