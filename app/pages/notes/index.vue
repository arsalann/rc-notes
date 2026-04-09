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
      <!-- Pinned notes -->
      <div v-if="pinnedNotes.length" class="mb-4">
        <div class="flex items-center gap-3 mb-3">
          <UIcon name="i-lucide-pin" class="size-3.5 text-purple-400" />
          <span class="text-[10px] uppercase tracking-wider text-(--ui-text-dimmed) font-medium">Pinned</span>
          <div class="h-px flex-1 bg-(--ui-border)" />
        </div>
        <div class="space-y-2.5">
          <NuxtLink v-for="note in pinnedNotes" :key="note.id" :to="`/notes/${note.id}`" class="block">
            <UCard class="transition-all duration-200 active:scale-[0.98] ring-1 ring-purple-500/20" :ui="{ body: 'p-3.5' }">
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-sm truncate" :class="!note.title && 'text-(--ui-text-dimmed) italic'">
                    {{ note.title || 'Untitled' }}
                  </h3>
                  <p v-if="note.preview" class="mt-1.5 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ note.preview }}</p>
                </div>
                <button @click.prevent.stop="togglePin(note)" class="p-1 -m-1 rounded-lg transition-colors active:bg-white/10">
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

      <!-- Other notes -->
      <div v-if="unpinnedNotes.length">
        <div v-if="pinnedNotes.length" class="flex items-center gap-3 mb-3">
          <span class="text-[10px] uppercase tracking-wider text-(--ui-text-dimmed) font-medium">Notes</span>
          <div class="h-px flex-1 bg-(--ui-border)" />
        </div>
        <div class="space-y-2.5">
          <NuxtLink v-for="note in unpinnedNotes" :key="note.id" :to="`/notes/${note.id}`" class="block">
            <UCard class="transition-all duration-200 active:scale-[0.98]" :ui="{ body: 'p-3.5' }">
              <div class="flex items-start justify-between gap-2">
                <div class="flex-1 min-w-0">
                  <h3 class="font-semibold text-sm truncate" :class="!note.title && 'text-(--ui-text-dimmed) italic'">
                    {{ note.title || 'Untitled' }}
                  </h3>
                  <p v-if="note.preview" class="mt-1.5 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ note.preview }}</p>
                </div>
                <button @click.prevent.stop="togglePin(note)" class="p-1 -m-1 rounded-lg transition-colors active:bg-white/10">
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

      <div v-if="!notes.length" class="text-center py-8">
        <UIcon name="i-lucide-file-text" class="size-8 text-(--ui-text-dimmed) mx-auto mb-2" />
        <p class="text-sm text-(--ui-text-dimmed)">No notes yet. Tap + to create one.</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const { notes, loading, fetchNotes, createNote } = useNotesCrud();
const { activeId } = useWorkspace();

const pinnedNotes = computed(() => notes.value.filter((n: any) => n.pinned));
const unpinnedNotes = computed(() => notes.value.filter((n: any) => !n.pinned));

async function load() {
  await fetchNotes({ workspace_id: activeId.value });
}

onMounted(load);
watch(activeId, load);

async function handleNew() {
  const n = await createNote({ title: 'Untitled', workspace_id: activeId.value });
  navigateTo(`/notes/${n.id}`);
}

async function togglePin(note: any) {
  const newPinned = !note.pinned;
  note.pinned = newPinned;
  await $fetch(`/api/notes/${note.id}`, {
    method: 'PUT',
    body: { pinned: newPinned },
  });
}
</script>
