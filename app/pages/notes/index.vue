<template>
  <div class="calm-page notes-page max-w-lg mx-auto">
    <div class="calm-page-header sticky top-0 z-30 px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight">{{ showArchived ? 'Archived notes' : 'Notebook' }}</h1>
          <WorkspaceSwitcher />
        </div>
        <div class="flex items-center gap-1">
          <UButton :icon="showArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'" color="neutral"
            :variant="showArchived ? 'soft' : 'ghost'" size="sm"
            :aria-label="showArchived ? 'Show notebook' : 'Show archived notes'" @click="toggleArchived" />
          <UButton v-if="!showArchived" color="secondary" icon="i-lucide-plus" size="sm" @click="handleNew" />
        </div>
      </div>
    </div>

    <div v-if="pageLoading" class="px-4 mt-3 space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-24 w-full" />
    </div>

    <div v-else class="px-4 mt-3 pb-6 space-y-4">
      <!-- Diary notes -->
      <section v-if="!showArchived">
        <button type="button"
          class="w-full min-h-11 flex items-center gap-2 py-2 text-left"
          :aria-expanded="diaryOpen"
          aria-controls="diary-notes-list"
          @click="diaryOpen = !diaryOpen">
          <UIcon :name="diaryOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-4 text-(--ui-text-dimmed)" />
          <UIcon name="i-lucide-book-heart" class="size-4 text-purple-400" />
          <span class="text-xs font-semibold uppercase tracking-wider">Diary notes</span>
          <span class="text-xs text-(--ui-text-dimmed) font-mono">({{ diaryNotes.length }})</span>
          <div class="h-px flex-1 bg-(--ui-border)" />
        </button>

        <div v-if="diaryOpen" id="diary-notes-list" class="mt-1 space-y-2.5">
          <NuxtLink v-for="diaryNote in diaryNotes" :key="diaryNote.id"
            :to="{ path: '/diary', query: { date: diaryNote.entry_date } }"
            class="block">
            <UCard class="calm-note-card transition-all duration-200 active:scale-[0.98] ring-1 ring-purple-500/15"
              :ui="{ body: 'p-3.5' }">
              <div class="flex items-start gap-3">
                <div class="mt-0.5 size-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-calendar-days" class="size-4 text-purple-400" />
                </div>
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-sm">{{ formatDiaryTitle(diaryNote.entry_date) }}</h3>
                  <p class="mt-1.5 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">
                    {{ diaryPreview(diaryNote) }}
                  </p>
                </div>
                <UIcon name="i-lucide-chevron-right" class="size-4 text-(--ui-text-dimmed) mt-1 shrink-0" />
              </div>
            </UCard>
          </NuxtLink>
          <p v-if="!diaryNotes.length" class="px-1 py-3 text-sm text-(--ui-text-dimmed) italic">
            Diary entries with notes will appear here.
          </p>
        </div>
      </section>

      <!-- Other notes -->
      <section>
        <button type="button"
          class="w-full min-h-11 flex items-center gap-2 py-2 text-left"
          :aria-expanded="otherOpen"
          aria-controls="other-notes-list"
          @click="otherOpen = !otherOpen">
          <UIcon :name="otherOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
            class="size-4 text-(--ui-text-dimmed)" />
          <UIcon :name="showArchived ? 'i-lucide-archive' : 'i-lucide-files'"
            :class="showArchived ? 'size-4 text-(--ui-text-dimmed)' : 'size-4 accent-text'" />
          <span class="text-xs font-semibold uppercase tracking-wider">
            {{ showArchived ? 'Archived notes' : 'Other notes' }}
          </span>
          <span class="text-xs text-(--ui-text-dimmed) font-mono">({{ notes.length }})</span>
          <div class="h-px flex-1 bg-(--ui-border)" />
        </button>

        <div v-if="otherOpen" id="other-notes-list" class="mt-1">
          <!-- Pinned notes -->
          <div v-if="pinnedNotes.length" class="mb-4">
            <div class="flex items-center gap-3 mb-3">
              <UIcon name="i-lucide-pin" class="size-3.5 text-purple-400" />
              <span class="text-[10px] uppercase tracking-wider text-(--ui-text-dimmed) font-medium">Pinned</span>
              <div class="h-px flex-1 bg-(--ui-border)" />
            </div>
            <div class="space-y-2.5">
              <NuxtLink v-for="note in pinnedNotes" :key="note.id" :to="`/notes/${note.id}`" class="block">
                <UCard class="calm-note-card transition-all duration-200 active:scale-[0.98] ring-1 ring-purple-500/20" :ui="{ body: 'p-3.5' }">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <h3 class="font-semibold text-sm truncate" :class="!note.title && 'text-(--ui-text-dimmed) italic'">
                        {{ note.title || 'Untitled' }}
                      </h3>
                      <p v-if="note.preview" class="mt-1.5 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ note.preview }}</p>
                    </div>
                    <button @click.prevent.stop="togglePin(note)" class="p-1 -m-1 rounded-lg transition-colors active:bg-(--ui-bg-elevated)">
                      <UIcon name="i-lucide-pin" class="size-4 text-purple-400" />
                    </button>
                  </div>
                  <div v-if="note.tags?.length" class="flex gap-1.5 mt-2.5 flex-wrap">
                    <UBadge v-for="tag in note.tags.slice(0, 3)" :key="tag" color="neutral" variant="subtle" size="xs">{{ tag }}</UBadge>
                  </div>
                </UCard>
              </NuxtLink>
            </div>
          </div>

          <div v-if="unpinnedNotes.length">
            <div v-if="pinnedNotes.length" class="flex items-center gap-3 mb-3">
              <span class="text-[10px] uppercase tracking-wider text-(--ui-text-dimmed) font-medium">Notes</span>
              <div class="h-px flex-1 bg-(--ui-border)" />
            </div>
            <div class="space-y-2.5">
              <NuxtLink v-for="note in unpinnedNotes" :key="note.id" :to="`/notes/${note.id}`" class="block">
                <UCard class="calm-note-card transition-all duration-200 active:scale-[0.98]" :ui="{ body: 'p-3.5' }">
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex-1 min-w-0">
                      <h3 class="font-semibold text-sm truncate" :class="!note.title && 'text-(--ui-text-dimmed) italic'">
                        {{ note.title || 'Untitled' }}
                      </h3>
                      <p v-if="note.preview" class="mt-1.5 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ note.preview }}</p>
                    </div>
                    <button @click.prevent.stop="togglePin(note)" class="p-1 -m-1 rounded-lg transition-colors active:bg-(--ui-bg-elevated)">
                      <UIcon name="i-lucide-pin-off" class="size-4 text-(--ui-text-dimmed)" />
                    </button>
                  </div>
                  <div v-if="note.tags?.length" class="flex gap-1.5 mt-2.5 flex-wrap">
                    <UBadge v-for="tag in note.tags.slice(0, 3)" :key="tag" color="neutral" variant="subtle" size="xs">{{ tag }}</UBadge>
                  </div>
                </UCard>
              </NuxtLink>
            </div>
          </div>

          <p v-if="!notes.length" class="px-1 py-3 text-sm text-(--ui-text-dimmed) italic">
            {{ showArchived ? 'No archived notes.' : 'No notes yet. Tap + to create one.' }}
          </p>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Note } from '~/composables/useNotes';

interface DiaryNoteSummary {
  id: string;
  workspace_id: string | null;
  entry_date: string;
  content: string;
  preview: string;
  created_at: string;
  updated_at: string;
}

const { notes, loading, fetchNotes, createNote } = useNotesCrud();
const { activeId } = useWorkspace();
const showArchived = ref(false);
const diaryNotes = ref<DiaryNoteSummary[]>([]);
const diaryLoading = ref(false);
const diaryOpen = ref(true);
const otherOpen = ref(true);

const pageLoading = computed(() => loading.value || diaryLoading.value);
const pinnedNotes = computed(() => notes.value.filter(note => note.pinned));
const unpinnedNotes = computed(() => notes.value.filter(note => !note.pinned));

async function fetchDiaryNotes() {
  diaryLoading.value = true;
  try {
    const query: Record<string, string> = {};
    if (activeId.value) query.workspace_id = activeId.value;
    diaryNotes.value = await $fetch<DiaryNoteSummary[]>('/api/diary', { query });
  } finally {
    diaryLoading.value = false;
  }
}

async function load() {
  const requests: Promise<unknown>[] = [
    fetchNotes({ workspace_id: activeId.value, archived: showArchived.value }),
  ];
  if (!showArchived.value) requests.push(fetchDiaryNotes());
  await Promise.all(requests);
}

function formatDiaryTitle(date: string) {
  const normalized = date.slice(0, 10);
  const weekday = new Date(`${normalized}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' });
  return `${normalized} ${weekday}`;
}

function diaryPreview(note: DiaryNoteSummary) {
  const preview = (note.preview || note.content)
    .replace(/@\[[^\]]+\]/g, '')
    .replace(/^\s*[-*]\s+\[[ xX]\]\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
  return preview || 'Linked tasks and diary activity';
}

onMounted(load);
watch(activeId, load);
function toggleArchived() {
  showArchived.value = !showArchived.value;
  otherOpen.value = true;
  load();
}

async function handleNew() {
  const note = await createNote({ title: 'Untitled', workspace_id: activeId.value });
  navigateTo(`/notes/${note.id}`);
}

async function togglePin(note: Note) {
  const newPinned = !note.pinned;
  note.pinned = newPinned;
  try {
    await $fetch(`/api/notes/${note.id}`, {
      method: 'PUT',
      body: { pinned: newPinned },
    });
  } catch (error) {
    note.pinned = !newPinned;
    throw error;
  }
}
</script>
