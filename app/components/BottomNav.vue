<template>
  <div class="fixed bottom-0 left-0 right-0 safe-bottom z-50 px-4 pb-2">
    <!-- Nav bar -->
    <nav class="bg-teal-900/80 backdrop-blur-xl rounded-2xl border border-teal-700/50 shadow-lg">
      <div class="flex items-center justify-around h-16 max-w-lg mx-auto px-1">
        <button v-for="ws in workspaceItems" :key="ws.id"
          :aria-label="ws.name"
          @click="goToWorkspace(ws.id)"
          class="flex items-center justify-center flex-1 h-14 rounded-xl transition-all duration-200 active:scale-95"
          :class="isWorkspaceActive(ws.id)
            ? 'bg-purple-500/15'
            : 'active:bg-(--ui-bg-elevated)'">
          <span class="text-2xl leading-none">{{ ws.emoji }}</span>
        </button>
        <NuxtLink to="/settings" aria-label="Settings"
          class="flex items-center justify-center flex-1 h-14 rounded-xl transition-all duration-200 active:scale-95"
          :class="isActive('/settings')
            ? 'text-purple-400 bg-purple-500/15'
            : 'text-(--ui-text-dimmed) active:text-(--ui-text-muted)'">
          <UIcon name="i-lucide-settings" class="size-6" />
        </NuxtLink>
      </div>
    </nav>
  </div>
</template>

<script setup lang="ts">
const route = useRoute();
const router = useRouter();
const { workspaces, activeId, setActive } = useWorkspace();
const { prefs } = usePreferences();

const workspaceItems = computed(() => {
  const list = workspaces.value;
  const ids = prefs.value.navWorkspaceIds || [];
  if (ids.length) {
    return ids.map(id => list.find(w => w.id === id)).filter(Boolean) as typeof list;
  }
  // Fallback: prefer ones named work/personal, else first two
  const byName = (n: string) => list.find(w => w.name.trim().toLowerCase() === n);
  const picked: typeof list = [];
  for (const name of ['work', 'personal']) {
    const w = byName(name);
    if (w) picked.push(w);
  }
  if (picked.length < 2) {
    for (const w of list) {
      if (picked.length >= 2) break;
      if (!picked.find(p => p.id === w.id)) picked.push(w);
    }
  }
  return picked;
});

function isActive(path: string) { return route.path === path || route.path.startsWith(path + '/'); }
function isWorkspaceActive(id: string) {
  return (route.path === '/diary' || route.path.startsWith('/diary/')) && activeId.value === id;
}
async function goToWorkspace(id: string) {
  setActive(id);
  if (route.path !== '/diary') await router.push('/diary');
}
</script>
