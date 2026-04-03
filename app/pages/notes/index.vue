<template>
  <div class="max-w-lg mx-auto">
    <div class="flex items-center justify-between px-4 pt-5 safe-top">
      <div class="flex items-center gap-3"><h1 class="text-2xl font-bold">Notes</h1><WorkspaceSwitcher/></div>
      <button @click="handleNew" class="touch-target accent-text"><svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg></button>
    </div>
    <div v-if="loading" class="px-4 mt-4 space-y-3"><div v-for="i in 3" :key="i" class="h-24 rounded-2xl animate-pulse" style="background-color:#27272a"/></div>
    <div v-else-if="notes.length" class="px-4 mt-4 space-y-3 pb-6">
      <NuxtLink v-for="note in notes" :key="note.id" :to="`/notes/${note.id}`" class="block p-4 surface-card rounded-2xl btn-tap">
        <div class="flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-[14px] truncate" :class="!note.title&&'text-faint'">{{ note.title||'Untitled' }}</h3>
            <p v-if="note.preview" class="mt-1 text-[13px] text-muted line-clamp-2">{{ note.preview }}</p>
          </div>
          <svg v-if="note.pinned" class="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-faint" fill="currentColor" viewBox="0 0 20 20"><path d="M10.75 2.567a1.5 1.5 0 0 0-1.5 0L3.456 6.05a1.5 1.5 0 0 0-.75 1.3v6.3a1.5 1.5 0 0 0 .75 1.3l5.794 3.483a1.5 1.5 0 0 0 1.5 0l5.794-3.483a1.5 1.5 0 0 0 .75-1.3v-6.3a1.5 1.5 0 0 0-.75-1.3L10.75 2.567Z"/></svg>
        </div>
        <div v-if="note.tags?.length" class="flex gap-1 mt-2 flex-wrap"><span v-for="tag in note.tags.slice(0,3)" :key="tag" class="tag">{{ tag }}</span></div>
      </NuxtLink>
    </div>
    <EmptyState v-else message="No notes yet. Tap + to create one." icon="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"/>
  </div>
</template>

<script setup lang="ts">
const {notes,loading,fetchNotes,createNote}=useNotesCrud(); const {activeId}=useWorkspace();
async function load(){await fetchNotes({workspace_id:activeId.value});} onMounted(load); watch(activeId,load);
async function handleNew(){const n=await createNote({title:'Untitled',workspace_id:activeId.value});navigateTo(`/notes/${n.id}`);}
</script>
