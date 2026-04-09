<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg flex items-center justify-between px-4 py-3 safe-top">
      <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" @click="navigateTo('/')" />
      <div class="flex items-center gap-1">
        <UButton color="neutral" variant="ghost" :icon="task?.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          :class="task?.pinned && 'text-(--ui-primary)'" @click="handlePin" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-archive" @click="confirmArchive = true" />
      </div>
    </div>

    <div v-if="loadingTask" class="flex items-center justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-(--ui-primary)" />
    </div>
    <div v-else-if="task" class="px-4 pb-12 space-y-5">
      <!-- ID + Workspace -->
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">{{ task.display_id }}</UBadge>
          <UDropdownMenu :items="workspaceMenuItems" :ui="{ content: 'min-w-44' }">
            <UButton color="neutral" variant="ghost" size="sm" trailing-icon="i-lucide-chevron-down">
              <UIcon name="i-lucide-folder" class="size-3.5" />
              {{ currentWorkspaceName }}
            </UButton>
          </UDropdownMenu>
        </div>
        <!-- Status pills -->
        <div class="flex items-center gap-2 mb-2">
          <UButton v-for="s in statusOptions" :key="s.value" size="sm"
            :color="task.status === s.value ? s.color : 'neutral'"
            :variant="task.status === s.value ? 'solid' : 'outline'"
            @click="setStatus(s.value)">
            {{ s.label }}
          </UButton>
        </div>
        <div class="flex items-start gap-3">
        <UCheckbox :model-value="task.completed" @update:model-value="handleToggleComplete" size="lg" class="mt-1" />
        <input v-model="editTitle" @blur="saveTitle" @keydown.enter="($event.target as HTMLInputElement).blur()"
          class="flex-1 text-2xl font-bold bg-transparent outline-none tracking-tight placeholder:text-(--ui-text-dimmed)"
          :class="task.completed && 'line-through text-(--ui-text-muted)'" placeholder="Task title" />
        </div>
      </div>

      <!-- Subtasks tree (directly under parent) -->
      <div class="ml-8 space-y-0.5">
        <div v-if="subtasks.length" class="flex items-center gap-3 mb-3">
          <UProgress :model-value="subtasksDone" :max="subtasks.length" size="xs" class="flex-1" />
          <span class="text-xs text-(--ui-text-dimmed) tabular-nums shrink-0">{{ subtasksDone }}/{{ subtasks.length }}</span>
        </div>
        <div class="border-l-2 border-(--ui-border) pl-3 space-y-0.5">
          <div v-for="sub in subtasks" :key="sub.id"
            class="flex items-center gap-2.5 py-2.5 px-2 -mx-2 rounded-lg transition-colors active:bg-(--ui-bg-elevated)">
            <UCheckbox :model-value="sub.completed" @update:model-value="toggleSubtask(sub.id)" />
            <span class="text-sm flex-1 transition-all duration-200" :class="sub.completed && 'line-through text-(--ui-text-muted)'">{{ sub.title }}</span>
            <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">{{ sub.display_id }}</UBadge>
            <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-archive"
              @click="archiveSubtask(sub.id)" />
          </div>
          <form @submit.prevent="addSubtask" class="flex items-center gap-2.5 py-2.5 px-2 -mx-2 rounded-lg">
            <UIcon name="i-lucide-circle-dashed" class="size-4 text-(--ui-text-dimmed) shrink-0" />
            <input v-model="newSubtask" placeholder="Add a subtask..."
              class="flex-1 bg-transparent outline-none text-(--ui-text-muted) placeholder:text-(--ui-text-dimmed)" />
            <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 scale-90" enter-to-class="opacity-100 scale-100"
              leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-90">
              <UButton v-if="newSubtask.trim()" type="submit" color="primary" variant="ghost" size="xs">Add</UButton>
            </Transition>
          </form>
        </div>
      </div>

      <!-- Description -->
      <textarea v-model="editDescription" @blur="saveDescription" placeholder="Add details..."
        class="w-full leading-7 bg-transparent outline-none resize-none text-(--ui-text-muted) min-h-[80px] placeholder:text-(--ui-text-dimmed)" />

      <!-- Due Date -->
      <UCard>
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-3">Due Date</p>
        <div class="flex items-center gap-2 flex-wrap">
          <UButton v-for="opt in dateShortcuts" :key="opt.label" :color="isDueMatch(opt.value) ? 'primary' : 'neutral'"
            :variant="isDueMatch(opt.value) ? 'solid' : 'soft'" size="sm" @click="saveDue(opt.value)">
            {{ opt.label }}
          </UButton>
          <span class="inline-flex">
            <UButton color="neutral" variant="soft" size="sm" @click="($refs.duePicker as HTMLInputElement)?.showPicker()">Pick...</UButton>
            <input ref="duePicker" type="datetime-local" :value="editDue" @change="saveDue(($event.target as HTMLInputElement).value)" class="sr-only" />
          </span>
          <UButton v-if="task.due_at" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" @click="saveDue('')" />
        </div>
      </UCard>

      <!-- Tags -->
      <UCard>
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-3">Tags</p>
        <div class="flex items-center gap-2 flex-wrap">
          <UBadge v-for="(tag, i) in editTags" :key="i" color="neutral" variant="subtle" size="sm" class="gap-1.5 py-1">
            {{ tag }}
            <button @click="removeTag(i)" class="p-0.5 -mr-0.5 rounded-full active:bg-white/10 transition-colors">&times;</button>
          </UBadge>
          <input v-model="newTag" @keydown.enter.prevent="addTag" @keydown.comma.prevent="addTag"
            placeholder="+ add tag" class="bg-transparent outline-none w-24 text-(--ui-text-muted) py-1.5 placeholder:text-(--ui-text-dimmed)" />
        </div>
      </UCard>

      <!-- Linked Note -->
      <div v-if="linkedNote">
        <div class="flex items-center justify-between mb-2">
          <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed)">Note</p>
          <NuxtLink :to="`/notes/${linkedNote.target_id}`">
            <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-external-link">Open</UButton>
          </NuxtLink>
        </div>
        <UCard :ui="{ body: 'p-3' }">
          <p class="text-sm font-medium">{{ linkedNote.target_title }}</p>
          <div v-if="linkedNoteContent" class="mt-2 prose prose-invert prose-sm max-w-none text-(--ui-text-muted)
            prose-headings:text-(--ui-text) prose-p:text-(--ui-text-muted)
            prose-a:text-(--ui-primary) prose-code:text-(--ui-primary)" v-html="linkedNoteContent" />
        </UCard>
      </div>

      <!-- Add Note button (only if no linked note) -->
      <UButton v-if="!linkedNote" color="neutral" variant="soft" icon="i-lucide-file-plus" block @click="handleAddNote">
        Add note
      </UButton>
    </div>

    <UModal v-model:open="confirmArchive" title="Archive task?" description="This task and its subtasks will be archived.">
      <template #footer>
        <div class="flex gap-3 w-full">
          <UButton color="neutral" variant="soft" class="flex-1" @click="confirmArchive = false">Cancel</UButton>
          <UButton color="warning" class="flex-1" @click="handleArchiveTask">Archive</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import type { Task } from '~/composables/useNotes';
import { parseUTC, todayLocal, localDateOffset } from '~/composables/useDate';

const route = useRoute(); const id = route.params.id as string;
const { updateTask, deleteTask, toggleComplete, togglePin, createTask } = useTasks();
const { createNote } = useNotesCrud();
const { workspaces } = useWorkspace();

const task = ref<Task | null>(null); const subtasks = ref<Task[]>([]); const loadingTask = ref(true); const confirmArchive = ref(false);
const newSubtask = ref(''); const newTag = ref(''); const editTitle = ref(''); const editDescription = ref(''); const editTags = ref<string[]>([]); const editDue = ref('');
const taskLinks = ref<any[]>([]);
const linkedNoteContent = ref('');

const subtasksDone = computed(() => subtasks.value.filter(s => s.completed).length);
const linkedNote = computed(() => taskLinks.value.find(l => l.target_type === 'note'));

const statusOptions = [
  { value: 'next', label: 'Next', color: 'neutral' as const },
  { value: 'now', label: 'Now', color: 'primary' as const },
  { value: 'done', label: 'Done', color: 'success' as const },
];

const currentWorkspaceName = computed(() => {
  if (!task.value?.workspace_id) return 'No workspace';
  const ws = workspaces.value.find(w => w.id === task.value!.workspace_id);
  return ws ? `${ws.emoji} ${ws.name}` : 'No workspace';
});

const workspaceMenuItems = computed(() => {
  const items: any[][] = [
    [{
      label: 'No workspace',
      icon: 'i-lucide-circle-slash',
      onSelect: () => changeWorkspace(null),
    }],
    workspaces.value.map(ws => ({
      label: `${ws.emoji} ${ws.name}`,
      onSelect: () => changeWorkspace(ws.id),
    })),
  ];
  return items;
});

async function changeWorkspace(wsId: string | null) {
  if (!task.value) return;
  task.value = await updateTask(id, { workspace_id: wsId } as any);
}

const dateShortcuts = computed(() => {
  return [
    { label: 'Today', value: `${todayLocal()}T09:00` },
    { label: 'Tomorrow', value: `${localDateOffset(1)}T09:00` },
    { label: 'Next week', value: `${localDateOffset(7)}T09:00` },
  ];
});
function isDueMatch(v: string) {
  if (!task.value?.due_at) return false;
  const d = parseUTC(task.value.due_at);
  const localDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return localDate === v.split('T')[0];
}

onMounted(async () => {
  try {
    const d = await $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${id}`);
    task.value = d; subtasks.value = d.subtasks || [];
    editTitle.value = d.title; editDescription.value = d.description;
    editTags.value = [...(d.tags || [])];
    if (d.due_at) {
      const local = parseUTC(d.due_at);
      editDue.value = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}T${String(local.getHours()).padStart(2, '0')}:${String(local.getMinutes()).padStart(2, '0')}`;
    } else {
      editDue.value = '';
    }
    // Fetch links for this task
    await fetchLinks();
  } finally { loadingTask.value = false; }
});

async function fetchLinks() {
  try {
    // Reuse the mention/links by fetching through search
    const links = await $fetch<any[]>(`/api/task-links/${id}`).catch(() => []);
    taskLinks.value = links;
    // Load linked note content
    if (linkedNote.value) {
      const noteData = await $fetch<any>(`/api/notes/${linkedNote.value.target_id}`).catch(() => null);
      if (noteData?.content) {
        linkedNoteContent.value = marked.parse(noteData.content) as string;
      }
    }
  } catch { /* no links API, fetch from note detail */ }
}

function extractTags(text: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const cleaned = text.replace(/#(\w[\w-]*)/g, (_, tag) => { tags.push(tag.toLowerCase()); return ''; }).replace(/\s{2,}/g, ' ').trim();
  return { title: cleaned, tags: [...new Set(tags)] };
}

async function saveTitle() {
  if (!task.value || editTitle.value.trim() === task.value.title) return;
  const { title: cleanTitle, tags: newTags } = extractTags(editTitle.value.trim());
  const mergedTags = [...new Set([...editTags.value, ...newTags])];
  editTitle.value = cleanTitle;
  editTags.value = mergedTags;
  task.value = await updateTask(id, { title: cleanTitle, tags: mergedTags } as any);
}
async function saveDescription() { if (!task.value || editDescription.value === task.value.description) return; task.value = await updateTask(id, { description: editDescription.value }); }
async function saveDue(v: string) { task.value = await updateTask(id, { due_at: v ? new Date(v).toISOString() : null } as any); editDue.value = v; }
function addTag() { const t = newTag.value.replace(',', '').trim(); if (t && !editTags.value.includes(t)) { editTags.value.push(t); updateTask(id, { tags: editTags.value } as any); } newTag.value = ''; }
function removeTag(i: number) { editTags.value.splice(i, 1); updateTask(id, { tags: editTags.value } as any); }
async function setStatus(status: string) {
  if (!task.value) return;
  task.value = await updateTask(id, { status } as any);
}
async function handleToggleComplete() { const u = await toggleComplete(id); if (task.value) { task.value.completed = u.completed; task.value.status = u.status; } }
async function handlePin() { const u = await togglePin(id); if (task.value) task.value.pinned = u.pinned; }
async function handleArchiveTask() { await deleteTask(id); navigateTo('/'); }
async function addSubtask() { const t = newSubtask.value.trim(); if (!t) return; const s = await createTask({ title: t, parent_id: id }); subtasks.value.push(s); newSubtask.value = ''; }
async function toggleSubtask(sid: string) { const u = await toggleComplete(sid); const i = subtasks.value.findIndex(s => s.id === sid); if (i >= 0) subtasks.value[i] = { ...subtasks.value[i], ...u }; }
async function archiveSubtask(sid: string) { await deleteTask(sid); subtasks.value = subtasks.value.filter(s => s.id !== sid); }

async function handleAddNote() {
  if (!task.value) return;
  const n = await createNote({ title: task.value.title, workspace_id: task.value.workspace_id });
  // Link the note to this task
  await $fetch('/api/links', { method: 'POST', body: { source_type: 'task', source_id: id, target_type: 'note', target_id: n.id } });
  navigateTo(`/notes/${n.id}`);
}
</script>
