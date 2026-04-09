<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg flex items-center justify-between px-4 py-3 safe-top">
      <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" @click="navigateTo('/notes')" />
      <div class="flex items-center gap-1">
        <Transition enter-active-class="transition ease-out duration-200" enter-from-class="opacity-0 scale-90" enter-to-class="opacity-100 scale-100"
          leave-active-class="transition ease-in duration-150" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-90">
          <div v-if="saving" class="flex items-center gap-1.5 text-xs text-(--ui-text-dimmed) mr-2">
            <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
            Saving
          </div>
        </Transition>
        <UButton :color="editMode ? 'secondary' : 'neutral'" :variant="editMode ? 'soft' : 'ghost'" size="sm"
          :icon="editMode ? 'i-lucide-eye' : 'i-lucide-pencil'" :loading="creatingTasks" @click="toggleEditMode" />
        <UButton color="neutral" variant="ghost" :icon="note?.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          :class="note?.pinned && 'text-(--ui-primary)'" @click="handlePin" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-archive" @click="confirmDelete = true" />
      </div>
    </div>

    <div v-if="loadingNote" class="flex items-center justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-(--ui-primary)" />
    </div>
    <div v-else-if="note" class="px-4 pb-12">
      <UBadge color="neutral" variant="subtle" size="xs" class="font-mono mb-1.5">{{ note.display_id }}</UBadge>
      <input v-model="editTitle" @blur="saveField('title', editTitle)" @keydown.enter="($event.target as HTMLInputElement).blur()"
        class="w-full text-2xl font-bold bg-transparent outline-none tracking-tight placeholder:text-(--ui-text-dimmed)" placeholder="Title" />

      <!-- Edit mode: raw textarea -->
      <div v-if="editMode" class="relative mt-4">
        <textarea v-model="editContent" @input="handleContentInput" @blur="saveField('content', editContent)" @keydown.escape="mentionOpen = false" ref="contentRef"
          class="w-full leading-7 bg-transparent outline-none resize-none text-(--ui-text-muted) min-h-[200px] placeholder:text-(--ui-text-dimmed) font-mono"
          placeholder="Write in markdown... Type @ to link a task or note" />
        <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 -translate-y-1" enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100" leave-to-class="opacity-0 -translate-y-1">
          <UCard v-if="mentionOpen && mentionResults.length" class="absolute left-0 right-0 z-50 max-h-48 overflow-y-auto overscroll-contain" :ui="{ body: 'p-1' }" style="top:0">
            <button v-for="item in mentionResults" :key="item.id" @mousedown.prevent="insertMention(item)"
              class="w-full px-3 py-3 text-left text-sm flex items-center gap-2 rounded-lg transition-colors active:bg-(--ui-bg-elevated)">
              <UBadge :color="item.type === 'task' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ item.type === 'task' ? 'Task' : 'Note' }}</UBadge>
              <span class="truncate">{{ item.title }}</span>
              <span class="text-xs text-(--ui-text-dimmed) font-mono ml-auto shrink-0">{{ item.display_id }}</span>
            </button>
          </UCard>
        </Transition>
      </div>

      <!-- Preview mode: rendered markdown with inline tasks -->
      <div v-else class="mt-4">
        <template v-for="(block, i) in renderedBlocks" :key="i">
          <InlineTask v-if="block.type === 'task'" :task-id="block.taskId" />
          <div v-else class="prose prose-invert prose-sm max-w-none
            prose-headings:text-(--ui-text) prose-p:text-(--ui-text-muted) prose-p:leading-7
            prose-a:text-(--ui-primary) prose-strong:text-(--ui-text)
            prose-code:text-(--ui-primary) prose-code:bg-(--ui-bg-elevated) prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-(--ui-bg-elevated) prose-pre:border prose-pre:border-(--ui-border)
            prose-li:text-(--ui-text-muted) prose-blockquote:border-(--ui-border) prose-blockquote:text-(--ui-text-dimmed)
            prose-hr:border-(--ui-border)"
            v-html="block.html" />
        </template>
        <p v-if="!editContent?.trim()" class="text-sm text-(--ui-text-dimmed) italic">Empty note. Switch to edit mode to start writing.</p>
      </div>

      <div v-if="note.links?.length" class="mt-8">
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-3">Linked</p>
        <div class="space-y-1">
          <NuxtLink v-for="link in note.links" :key="link.link_id" :to="link.target_type === 'task' ? `/tasks/${link.target_id}` : `/notes/${link.target_id}`"
            class="flex items-center gap-2.5 py-3 px-3 -mx-3 rounded-lg text-sm text-(--ui-primary) transition-colors active:bg-(--ui-bg-elevated)">
            <UBadge :color="link.target_type === 'task' ? 'primary' : 'neutral'" variant="subtle" size="xs">{{ link.target_type === 'task' ? 'Task' : 'Note' }}</UBadge>
            {{ link.target_title }}
          </NuxtLink>
        </div>
      </div>
    </div>

    <UModal v-model:open="confirmDelete" title="Archive note?" description="You can find archived notes later.">
      <template #footer>
        <div class="flex gap-3 w-full">
          <UButton color="neutral" variant="soft" class="flex-1" @click="confirmDelete = false">Cancel</UButton>
          <UButton color="error" class="flex-1" @click="handleDelete">Archive</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import type { Note } from '~/composables/useNotes';
import { parseChecklist, hasChecklist, replaceChecklistWithMentions } from '~/composables/useChecklist';

const route = useRoute(); const id = route.params.id as string;
const { updateNote, deleteNote, togglePin } = useNotesCrud();
const note = ref<Note | null>(null); const loadingNote = ref(true); const saving = ref(false); const confirmDelete = ref(false);
const editTitle = ref(''); const editContent = ref(''); const contentRef = ref<HTMLTextAreaElement>();
const mentionOpen = ref(false); const mentionResults = ref<any[]>([]);
const editMode = ref(true);
const creatingTasks = ref(false);

// Parse content into blocks: markdown text + inline task embeds
const renderedBlocks = computed(() => {
  if (!editContent.value) return [];
  const blocks: { type: 'html' | 'task'; html?: string; taskId?: string }[] = [];
  // Split on @[...] patterns - find task references
  const regex = /@\[([^\]]+)\]/g;
  let lastIndex = 0;
  let match;
  const content = editContent.value;

  while ((match = regex.exec(content)) !== null) {
    // Text before the match
    const before = content.slice(lastIndex, match.index);
    if (before.trim()) {
      blocks.push({ type: 'html', html: marked.parse(before) as string });
    }
    // Check if this references a task (starts with T) or look up by linked items
    const ref = match[1];
    const linkedTask = note.value?.links?.find(
      l => l.target_type === 'task' && (l.target_title === ref || l.target_id === ref)
    );
    if (linkedTask) {
      blocks.push({ type: 'task', taskId: linkedTask.target_id });
    } else if (ref.startsWith('T')) {
      // Might be a task ID directly
      blocks.push({ type: 'task', taskId: ref });
    } else {
      // Not a task, render as text
      blocks.push({ type: 'html', html: marked.parse(`@[${ref}]`) as string });
    }
    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  const remaining = content.slice(lastIndex);
  if (remaining.trim()) {
    blocks.push({ type: 'html', html: marked.parse(remaining) as string });
  }

  return blocks;
});

onMounted(async () => {
  try {
    const d = await $fetch<Note>(`/api/notes/${id}`);
    note.value = d;
    editTitle.value = d.title;
    editContent.value = d.content;
    // Start in preview mode if note has content
    if (d.content?.trim()) editMode.value = false;
  } finally { loadingNote.value = false; }
});

let saveTimer: ReturnType<typeof setTimeout>;
function saveField(f: string, v: string) {
  if (!note.value) return;
  clearTimeout(saveTimer);
  saving.value = true;
  saveTimer = setTimeout(async () => {
    await updateNote(id, { [f]: v } as any);
    saving.value = false;
  }, 300);
}

function handleContentInput() {
  saveField('content', editContent.value);
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value.substring(0, pos); const at = text.lastIndexOf('@');
  if (at >= 0 && (at === 0 || text[at - 1] === ' ' || text[at - 1] === '\n')) {
    const q = text.substring(at + 1);
    if (q.length > 0 && !q.includes(' ') && !q.includes('\n')) {
      mentionOpen.value = true; searchMentions(q); return;
    }
  }
  mentionOpen.value = false;
}

async function searchMentions(q: string) { mentionResults.value = await $fetch<any[]>('/api/mention', { query: { q } }); }

async function insertMention(item: { id: string; type: string; title: string }) {
  const el = contentRef.value; if (!el) return;
  const pos = el.selectionStart; const text = editContent.value; const at = text.lastIndexOf('@', pos - 1);
  editContent.value = text.substring(0, at) + `@[${item.title}]` + text.substring(pos);
  mentionOpen.value = false;
  await $fetch('/api/links', { method: 'POST', body: { source_type: 'note', source_id: id, target_type: item.type, target_id: item.id } });
  note.value = await $fetch<Note>(`/api/notes/${id}`);
  saveField('content', editContent.value);
}

async function toggleEditMode() {
  if (editMode.value && hasChecklist(editContent.value) && note.value) {
    // Switching to view mode — auto-convert checklists to tasks
    creatingTasks.value = true;
    try {
      const items = parseChecklist(editContent.value);
      if (items.length) {
        await $fetch<any[]>('/api/tasks/from-checklist', {
          method: 'POST',
          body: {
            items,
            source_type: 'note',
            source_id: note.value.id,
            workspace_id: note.value.workspace_id,
          },
        });

        const rootTitles = items.map(i => i.title);
        editContent.value = replaceChecklistWithMentions(editContent.value, rootTitles);
        saveField('content', editContent.value);

        // Reload note to get updated links
        note.value = await $fetch<Note>(`/api/notes/${id}`);
      }
    } finally {
      creatingTasks.value = false;
    }
  }
  editMode.value = !editMode.value;
}

async function handlePin() { if (!note.value) return; const u = await togglePin(id); note.value.pinned = u.pinned; }
async function handleDelete() { await deleteNote(id); navigateTo('/notes'); }
</script>
