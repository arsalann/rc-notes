<template>
  <UEmpty :icon="icon" :description="message" class="py-16" />
</template>

<script setup lang="ts">
defineProps<{ message: string; icon?: string }>();
</script>
