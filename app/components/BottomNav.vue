<template>
  <div class="fixed bottom-0 left-0 right-0 safe-bottom z-50 px-4 pb-2">
    <!-- Search bar -->
    <div class="mb-2 max-w-lg mx-auto">
      <div class="relative">
        <input ref="searchInput" :value="query" @input="search(($event.target as HTMLInputElement).value)"
          @focus="searchFocused = true"
          placeholder="Search tasks and notes..."
          class="w-full pl-9 pr-9 py-2.5 text-sm bg-teal-900/90 backdrop-blur-xl rounded-xl border border-teal-700/50 outline-none placeholder:text-(--ui-text-dimmed) text-(--ui-text) transition-all duration-200 focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20" />
        <UIcon name="i-lucide-search" class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-(--ui-text-dimmed)" />
        <button v-if="query" @click="clearSearch" class="absolute right-3 top-1/2 -translate-y-1/2 text-(--ui-text-dimmed) hover:text-(--ui-text-muted)">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>

      <!-- Results overlay -->
      <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 translate-y-2" enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0 translate-y-2">
        <div v-if="searchFocused && (query || searching)" class="absolute bottom-full left-0 right-0 mb-2 max-h-72 overflow-y-auto rounded-xl bg-teal-900 border border-teal-700/50 shadow-2xl">
          <div v-if="searching" class="p-3 space-y-2">
            <div v-for="i in 3" :key="i" class="h-10 rounded-lg bg-teal-800/50 animate-pulse" />
          </div>
          <div v-else-if="results.length" class="py-1">
            <template v-for="item in results" :key="item.id">
              <NuxtLink v-if="item.type === 'task'" :to="`/tasks/${item.id}`" @click="clearSearch"
                class="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-teal-800/50">
                <UBadge color="primary" variant="subtle" size="xs">Task</UBadge>
                <span class="text-sm truncate" :class="item.completed && 'line-through text-(--ui-text-dimmed)'">{{ item.title }}</span>
              </NuxtLink>
              <NuxtLink v-else :to="`/notes/${item.id}`" @click="clearSearch"
                class="flex items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-teal-800/50">
                <UBadge color="neutral" variant="subtle" size="xs">Note</UBadge>
                <span class="text-sm truncate">{{ item.title }}</span>
              </NuxtLink>
            </template>
          </div>
          <div v-else-if="query" class="p-4 text-center text-xs text-(--ui-text-dimmed)">No results found</div>
        </div>
      </Transition>
    </div>

    <!-- Nav bar -->
    <nav class="bg-teal-900/80 backdrop-blur-xl rounded-2xl border border-teal-700/50 shadow-lg">
      <div class="flex items-center justify-around h-15 max-w-lg mx-auto">
        <NuxtLink v-for="item in items" :key="item.to" :to="item.to"
          class="flex flex-col items-center justify-center w-16 h-12 rounded-xl text-[10px] font-medium tracking-wide transition-all duration-200"
          :class="isActive(item.to)
            ? 'text-purple-400 bg-purple-500/15'
            : 'text-(--ui-text-dimmed) hover:text-(--ui-text-muted)'">
          <UIcon :name="item.icon" class="size-5 mb-0.5" />
          <span>{{ item.label }}</span>
        </NuxtLink>
      </div>
    </nav>
  </div>

  <!-- Backdrop when search is focused -->
  <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0" enter-to-class="opacity-100"
    leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0">
    <div v-if="searchFocused && query" class="fixed inset-0 z-40 bg-black/40" @click="clearSearch" />
  </Transition>
</template>

<script setup lang="ts">
const route = useRoute();
const { activeId } = useWorkspace();
const { toggleComplete } = useTasks();

const items = [
  { to: '/', label: 'Tasks', icon: 'i-lucide-circle-check' },
  { to: '/notes', label: 'Notes', icon: 'i-lucide-file-text' },
  { to: '/diary', label: 'Diary', icon: 'i-lucide-book-open' },
  { to: '/calendar', label: 'Calendar', icon: 'i-lucide-calendar' },
  { to: '/settings', label: 'Settings', icon: 'i-lucide-settings' },
];
function isActive(path: string) { if (path === '/') return route.path === '/'; return route.path.startsWith(path); }

const query = ref('');
const results = ref<any[]>([]);
const searching = ref(false);
const searchFocused = ref(false);
const searchInput = ref<HTMLInputElement>();
let dt: ReturnType<typeof setTimeout>;

function search(q: string) {
  query.value = q;
  clearTimeout(dt);
  if (!q.trim()) { results.value = []; return; }
  dt = setTimeout(async () => {
    searching.value = true;
    try {
      const p: Record<string, string> = { q };
      if (activeId.value) p.workspace_id = activeId.value;
      results.value = await $fetch<any[]>('/api/search', { query: p });
    } finally { searching.value = false; }
  }, 300);
}

function clearSearch() {
  query.value = '';
  results.value = [];
  searchFocused.value = false;
  searchInput.value?.blur();
}
</script>
