<template>
  <div class="max-w-lg mx-auto min-h-screen">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg flex items-center justify-between px-4 py-3 safe-top">
      <UButton color="neutral" variant="ghost" icon="i-lucide-chevron-left" @click="navigateTo('/')" />
      <div class="flex items-center gap-1">
        <UButton color="neutral" variant="ghost" :icon="task?.pinned ? 'i-lucide-pin-off' : 'i-lucide-pin'"
          :class="task?.pinned && 'text-(--ui-primary)'" @click="handlePin" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-archive" @click="handleArchive" />
        <UButton color="neutral" variant="ghost" icon="i-lucide-trash-2" @click="confirmDelete = true" />
      </div>
    </div>

    <div v-if="loadingTask" class="flex items-center justify-center py-20">
      <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-(--ui-primary)" />
    </div>
    <div v-else-if="task" class="px-4 pb-8 space-y-5">
      <!-- ID + Workspace -->
      <div>
        <div class="flex items-center gap-2 mb-1.5">
          <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">{{ task.display_id }}</UBadge>
          <UDropdownMenu :items="workspaceMenuItems" :ui="{ content: 'min-w-44' }">
            <UButton color="neutral" variant="ghost" size="xs" trailing-icon="i-lucide-chevron-down" class="text-xs">
              <UIcon name="i-lucide-folder" class="size-3" />
              {{ currentWorkspaceName }}
            </UButton>
          </UDropdownMenu>
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
            class="group flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg transition-colors hover:bg-(--ui-bg-elevated)">
            <UCheckbox :model-value="sub.completed" @update:model-value="toggleSubtask(sub.id)" />
            <span class="text-sm flex-1 transition-all duration-200" :class="sub.completed && 'line-through text-(--ui-text-muted)'">{{ sub.title }}</span>
            <UBadge color="neutral" variant="subtle" size="xs" class="font-mono opacity-0 group-hover:opacity-100 transition-opacity">{{ sub.display_id }}</UBadge>
            <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x"
              class="opacity-0 group-hover:opacity-100 transition-opacity" @click="deleteSubtask(sub.id)" />
          </div>
          <form @submit.prevent="addSubtask" class="flex items-center gap-2.5 py-2 px-2 -mx-2 rounded-lg">
            <UIcon name="i-lucide-circle-dashed" class="size-4 text-(--ui-text-dimmed) shrink-0" />
            <input v-model="newSubtask" placeholder="Add a subtask..."
              class="flex-1 text-sm bg-transparent outline-none text-(--ui-text-muted) placeholder:text-(--ui-text-dimmed)" />
            <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0 scale-90" enter-to-class="opacity-100 scale-100"
              leave-active-class="transition ease-in duration-100" leave-from-class="opacity-100 scale-100" leave-to-class="opacity-0 scale-90">
              <UButton v-if="newSubtask.trim()" type="submit" color="primary" variant="ghost" size="xs">Add</UButton>
            </Transition>
          </form>
        </div>
      </div>

      <!-- Description -->
      <textarea v-model="editDescription" @blur="saveDescription" placeholder="Add details..."
        class="w-full text-sm leading-7 bg-transparent outline-none resize-none text-(--ui-text-muted) min-h-[60px] placeholder:text-(--ui-text-dimmed)" />

      <!-- Due Date -->
      <UCard>
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-3">Due Date</p>
        <div class="flex items-center gap-2 flex-wrap">
          <UButton v-for="opt in dateShortcuts" :key="opt.label" :color="isDueMatch(opt.value) ? 'primary' : 'neutral'"
            :variant="isDueMatch(opt.value) ? 'solid' : 'soft'" size="xs" @click="saveDue(opt.value)">
            {{ opt.label }}
          </UButton>
          <label class="inline-flex">
            <UButton color="neutral" variant="soft" size="xs" as="span">Pick...</UButton>
            <input type="datetime-local" :value="editDue" @change="saveDue(($event.target as HTMLInputElement).value)" class="sr-only" />
          </label>
          <UButton v-if="task.due_at" color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="saveDue('')" />
        </div>
      </UCard>

      <!-- Tags -->
      <UCard>
        <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-3">Tags</p>
        <div class="flex items-center gap-1.5 flex-wrap">
          <UBadge v-for="(tag, i) in editTags" :key="i" color="neutral" variant="subtle" size="sm" class="gap-1">
            {{ tag }}
            <button @click="removeTag(i)" class="opacity-50 hover:opacity-100 transition-opacity ml-0.5">&times;</button>
          </UBadge>
          <input v-model="newTag" @keydown.enter.prevent="addTag" @keydown.comma.prevent="addTag"
            placeholder="+ add tag" class="text-xs bg-transparent outline-none w-20 text-(--ui-text-muted) py-1 placeholder:text-(--ui-text-dimmed)" />
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
        <UCard :ui="{ body: 'sm:p-3' }">
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

    <UModal v-model:open="confirmDelete" title="Delete task?" description="This will also delete all subtasks.">
      <template #footer>
        <div class="flex gap-3 w-full">
          <UButton color="neutral" variant="soft" class="flex-1" @click="confirmDelete = false">Cancel</UButton>
          <UButton color="error" class="flex-1" @click="handleDelete">Delete</UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { marked } from 'marked';
import type { Task } from '~/composables/useNotes';

const route = useRoute(); const id = route.params.id as string;
const { updateTask, deleteTask, toggleComplete, togglePin, toggleArchive, createTask } = useTasks();
const { createNote } = useNotesCrud();
const { workspaces } = useWorkspace();

const task = ref<Task | null>(null); const subtasks = ref<Task[]>([]); const loadingTask = ref(true); const confirmDelete = ref(false);
const newSubtask = ref(''); const newTag = ref(''); const editTitle = ref(''); const editDescription = ref(''); const editTags = ref<string[]>([]); const editDue = ref('');
const taskLinks = ref<any[]>([]);
const linkedNoteContent = ref('');

const subtasksDone = computed(() => subtasks.value.filter(s => s.completed).length);
const linkedNote = computed(() => taskLinks.value.find(l => l.target_type === 'note'));

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

const dateShortcuts = computed(() => { const t = new Date(); const tm = new Date(t); tm.setDate(tm.getDate() + 1); const nw = new Date(t); nw.setDate(nw.getDate() + 7);
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}T09:00`;
  return [{ label: 'Today', value: f(t) }, { label: 'Tomorrow', value: f(tm) }, { label: 'Next week', value: f(nw) }]; });
function isDueMatch(v: string) { if (!task.value?.due_at) return false; return task.value.due_at.startsWith(v.split('T')[0]); }

onMounted(async () => {
  try {
    const d = await $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${id}`);
    task.value = d; subtasks.value = d.subtasks || [];
    editTitle.value = d.title; editDescription.value = d.description;
    editTags.value = [...(d.tags || [])]; editDue.value = d.due_at ? d.due_at.slice(0, 16) : '';
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

async function saveTitle() { if (!task.value || editTitle.value.trim() === task.value.title) return; task.value = await updateTask(id, { title: editTitle.value.trim() }); }
async function saveDescription() { if (!task.value || editDescription.value === task.value.description) return; task.value = await updateTask(id, { description: editDescription.value }); }
async function saveDue(v: string) { task.value = await updateTask(id, { due_at: v ? new Date(v).toISOString() : null } as any); editDue.value = v; }
function addTag() { const t = newTag.value.replace(',', '').trim(); if (t && !editTags.value.includes(t)) { editTags.value.push(t); updateTask(id, { tags: editTags.value } as any); } newTag.value = ''; }
function removeTag(i: number) { editTags.value.splice(i, 1); updateTask(id, { tags: editTags.value } as any); }
async function handleToggleComplete() { const u = await toggleComplete(id); if (task.value) task.value.completed = u.completed; }
async function handlePin() { const u = await togglePin(id); if (task.value) task.value.pinned = u.pinned; }
async function handleArchive() { await toggleArchive(id); navigateTo('/'); }
async function handleDelete() { await deleteTask(id); navigateTo('/'); }
async function addSubtask() { const t = newSubtask.value.trim(); if (!t) return; const s = await createTask({ title: t, parent_id: id }); subtasks.value.push(s); newSubtask.value = ''; }
async function toggleSubtask(sid: string) { const u = await toggleComplete(sid); const i = subtasks.value.findIndex(s => s.id === sid); if (i >= 0) subtasks.value[i] = { ...subtasks.value[i], ...u }; }
async function deleteSubtask(sid: string) { await deleteTask(sid); subtasks.value = subtasks.value.filter(s => s.id !== sid); }

async function handleAddNote() {
  if (!task.value) return;
  const n = await createNote({ title: task.value.title, workspace_id: task.value.workspace_id });
  // Link the note to this task
  await $fetch('/api/links', { method: 'POST', body: { source_type: 'task', source_id: id, target_type: 'note', target_id: n.id } });
  navigateTo(`/notes/${n.id}`);
}
</script>
