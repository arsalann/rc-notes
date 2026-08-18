<template>
  <UApp>
    <!-- The design lab is deliberately public and local-only: it has no data dependency. -->
    <div v-if="isDesignLab" class="app-shell min-h-screen">
      <NuxtPage />
    </div>

    <!-- Loading -->
    <div v-else-if="appState === 'loading'" class="app-shell min-h-screen flex items-center justify-center">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-(--ui-text-dimmed)" />
    </div>

    <!-- Onboarding -->
    <Setup v-else-if="appState === 'setup'" />

    <!-- Login -->
    <Login v-else-if="appState === 'login'" />

    <!-- App -->
    <template v-else>
      <div class="app-shell min-h-screen pb-28">
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
const route = useRoute();
// Shared with the `pages:extend` hook in nuxt.config.ts that strips these routes from production,
// so the auth bypass and the route removal cannot drift apart.
const isDesignLab = computed(() => isDesignLabPath(route.path));

onMounted(async () => {
  if (isDesignLab.value) return;
  await checkAuth();
  if (appState.value === 'ready') {
    await fetchWorkspaces();
  }
});

watch(appState, async (state) => {
  if (state === 'ready' && !isDesignLab.value) {
    await fetchWorkspaces();
  }
});
</script>
