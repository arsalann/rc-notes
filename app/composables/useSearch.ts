import type { Task } from './useNotes';

export function useSearch() {
  const query = ref('');
  const results = ref<Task[]>([]);
  const searching = ref(false);
  let debounceTimer: ReturnType<typeof setTimeout>;

  async function search(q: string) {
    if (!q.trim()) {
      results.value = [];
      return;
    }
    searching.value = true;
    try {
      results.value = await $fetch<Task[]>('/api/search', { query: { q } });
    } finally {
      searching.value = false;
    }
  }

  function debouncedSearch(q: string) {
    clearTimeout(debounceTimer);
    query.value = q;
    debounceTimer = setTimeout(() => search(q), 300);
  }

  return { query, results, searching, search: debouncedSearch };
}
