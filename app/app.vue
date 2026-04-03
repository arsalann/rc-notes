<template>
  <UApp>
    <div class="min-h-screen pb-36">
      <NuxtPage />
      <BottomNav />
    </div>
    <UToaster />
  </UApp>
</template>

<script setup lang="ts">
const { fetchWorkspaces } = useWorkspace();
onMounted(() => fetchWorkspaces());
</script>
