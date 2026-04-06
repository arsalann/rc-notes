<template>
  <div class="max-w-lg mx-auto">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight">Notebook</h1>
          <WorkspaceSwitcher />
        </div>
        <UButton color="secondary" icon="i-lucide-plus" size="sm" @click="handleNew" />
      </div>
    </div>

    <div v-if="loading" class="px-4 mt-3 space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
    </div>

    <div v-else class="px-4 mt-3 pb-6">
      <!-- Today's diary entry (pinned) -->
      <NuxtLink to="/diary" class="block mb-3">
        <UCard class="transition-all duration-200 active:scale-[0.98] ring-1 ring-purple-500/20 bg-purple-500/5" :ui="{ body: 'p-3.5' }">
          <div class="flex items-start gap-3">
            <div class="shrink-0 mt-0.5 size-8 rounded-lg bg-purple-500/15 flex items-center justify-center">
              <UIcon name="i-lucide-calendar-heart" class="size-4 text-purple-400" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-sm">Today's Diary</h3>
                <span class="text-[10px] uppercase tracking-wider text-(--ui-text-dimmed) font-medium">{{ todayLabel }}</span>
              </div>
              <p v-if="diaryPreview" class="mt-1 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ diaryPreview }}</p>
            </div>
          </div>
        </UCard>
      </NuxtLink>

      <!-- Separator -->
      <div class="flex items-center gap-3 my-4">
        <div class="h-px flex-1 bg-(--ui-border)" />
        <span class="text-[10px] uppercase tracking-wider text-(--ui-text-dimmed) font-medium">Notes</span>
        <div class="h-px flex-1 bg-(--ui-border)" />
      </div>

      <!-- Notes list -->
      <div v-if="notes.length" class="space-y-2.5">
        <NuxtLink v-for="note in notes" :key="note.id" :to="`/notes/${note.id}`" class="block">
          <UCard class="transition-all duration-200 active:scale-[0.98]" :ui="{ body: 'p-3.5' }">
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <h3 class="font-semibold text-sm truncate" :class="!note.title && 'text-(--ui-text-dimmed) italic'">
                  {{ note.title || 'Untitled' }}
                </h3>
                <p v-if="note.preview" class="mt-1.5 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ note.preview }}</p>
              </div>
              <UIcon v-if="note.pinned" name="i-lucide-pin" class="size-3.5 text-(--ui-text-dimmed) shrink-0 mt-0.5" />
            </div>
            <div v-if="note.tags?.length" class="flex gap-1.5 mt-2.5 flex-wrap">
              <UBadge v-for="tag in note.tags.slice(0, 3)" :key="tag" color="neutral" variant="subtle" size="xs">{{ tag }}</UBadge>
            </div>
          </UCard>
        </NuxtLink>
      </div>
      <div v-else class="text-center py-8">
        <UIcon name="i-lucide-file-text" class="size-8 text-(--ui-text-dimmed) mx-auto mb-2" />
        <p class="text-sm text-(--ui-text-dimmed)">No notes yet. Tap + to create one.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { todayLocal } from '~/composables/useDate';
const { notes, loading: notesLoading, fetchNotes, createNote } = useNotesCrud();
const { activeId } = useWorkspace();

const diaryPreview = ref('');
const diaryLoading = ref(false);
const loading = computed(() => notesLoading.value || diaryLoading.value);

const todayLabel = computed(() => {
  return new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
});

async function fetchDiary() {
  const today = todayLocal();
  diaryLoading.value = true;
  try {
    const q: Record<string, string> = {};
    if (activeId.value) q.workspace_id = activeId.value;
    const entry = await $fetch<{ content: string }>(`/api/diary/${today}`, { query: q }).catch(() => null);
    diaryPreview.value = entry?.content?.trim()
      ? entry.content.replace(/[#*_`@\[\]]/g, '').slice(0, 120)
      : '';
  } catch {
    diaryPreview.value = '';
  } finally {
    diaryLoading.value = false;
  }
}

async function load() {
  await Promise.all([
    fetchNotes({ workspace_id: activeId.value }),
    fetchDiary(),
  ]);
}

onMounted(load);
watch(activeId, load);

async function handleNew() {
  const n = await createNote({ title: 'Untitled', workspace_id: activeId.value });
  navigateTo(`/notes/${n.id}`);
}
</script>
