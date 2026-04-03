<template>
  <div class="min-h-screen pb-20">
    <NuxtPage />
    <BottomNav />
  </div>
</template>

<script setup lang="ts">
const { fetchWorkspaces } = useWorkspace();
onMounted(() => fetchWorkspaces());
</script>
