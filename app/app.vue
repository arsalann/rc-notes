<template>
  <UApp>
    <!-- Loading -->
    <div v-if="appState === 'loading'" class="min-h-screen flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-(--ui-text-dimmed)" />
    </div>

    <!-- Onboarding -->
    <Setup v-else-if="appState === 'setup'" />

    <!-- Login -->
    <Login v-else-if="appState === 'login'" />

    <!-- App -->
    <template v-else>
      <div class="min-h-screen pb-40">
        <NuxtPage />
        <BottomNav />
      </div>
    </template>

    <UToaster />
  </UApp>
</template>

<script setup lang="ts">
import Setup from '~/pages/setup.vue';
import Login from '~/pages/login.vue';

const { appState, checkAuth } = useAuth();
const { fetchWorkspaces } = useWorkspace();

onMounted(async () => {
  await checkAuth();
  if (appState.value === 'ready') {
    await fetchWorkspaces();
  }
});

watch(appState, async (state) => {
  if (state === 'ready') {
    await fetchWorkspaces();
  }
});
</script>
