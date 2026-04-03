<template>
  <div class="max-w-lg mx-auto">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight">Notes</h1>
          <WorkspaceSwitcher />
        </div>
        <UButton color="secondary" icon="i-lucide-plus" size="sm" @click="handleNew" />
      </div>
    </div>
    <div v-if="loading" class="px-4 mt-3 space-y-3">
      <USkeleton v-for="i in 3" :key="i" class="h-24 w-full" />
    </div>
    <div v-else-if="notes.length" class="px-4 mt-3 space-y-2.5 pb-6">
      <NuxtLink v-for="note in notes" :key="note.id" :to="`/notes/${note.id}`" class="block">
        <UCard class="transition-all duration-200 hover:ring-(--ui-primary)/20">
          <div class="flex items-start justify-between gap-2">
            <div class="flex-1 min-w-0">
              <h3 class="font-semibold text-sm truncate" :class="!note.title && 'text-(--ui-text-dimmed) italic'">
                {{ note.title || 'Untitled' }}
              </h3>
              <p v-if="note.preview" class="mt-1 text-xs text-(--ui-text-muted) line-clamp-2 leading-relaxed">{{ note.preview }}</p>
            </div>
            <UIcon v-if="note.pinned" name="i-lucide-pin" class="size-3.5 text-(--ui-text-dimmed) shrink-0 mt-0.5" />
          </div>
          <div v-if="note.tags?.length" class="flex gap-1.5 mt-2.5 flex-wrap">
            <UBadge v-for="tag in note.tags.slice(0, 3)" :key="tag" color="neutral" variant="subtle" size="xs">{{ tag }}</UBadge>
          </div>
        </UCard>
      </NuxtLink>
    </div>
    <EmptyState v-else message="No notes yet. Tap + to create one." icon="i-lucide-file-text" />
  </div>
</template>

<script setup lang="ts">
const {notes,loading,fetchNotes,createNote}=useNotesCrud(); const {activeId}=useWorkspace();
async function load(){await fetchNotes({workspace_id:activeId.value});} onMounted(load); watch(activeId,load);
async function handleNew(){const n=await createNote({title:'Untitled',workspace_id:activeId.value});navigateTo(`/notes/${n.id}`);}
</script>
