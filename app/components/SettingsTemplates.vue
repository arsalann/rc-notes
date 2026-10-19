<template>
  <UCard>
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-layout-template" class="size-5" />
        <span class="font-semibold">Templates</span>
      </div>
    </template>

    <div class="space-y-3">
      <p v-if="!loaded" class="text-xs text-(--ui-text-dimmed)">Loading…</p>
      <p v-else-if="!templates.length" class="text-xs text-(--ui-text-muted)">
        No templates yet. Open a task and tap
        <UIcon name="i-lucide-layout-template" class="size-3.5 align-[-2px]" aria-label="the template icon" />
        to save it and its subtasks as a template. Then pick it from <span class="font-medium">Template</span> in the add-task form.
      </p>

      <div v-for="t in templates" :key="t.id" class="rounded-xl ring-1 ring-(--ui-border) bg-(--ui-bg-elevated)">
        <div class="flex items-center gap-2 px-3 py-2">
          <button type="button" class="flex-1 min-w-0 text-left min-h-11" :aria-expanded="editingId === t.id" @click="toggleEdit(t)">
            <p class="text-sm font-medium truncate">{{ t.name }}</p>
            <p class="text-xs text-(--ui-text-dimmed) truncate">
              {{ t.subtasks.length ? `${t.subtasks.length} subtask${t.subtasks.length === 1 ? '' : 's'}` : 'No subtasks' }}
              <template v-if="t.title !== t.name"> · {{ t.title }}</template>
            </p>
          </button>
          <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-plus" :loading="usingId === t.id"
            :aria-label="`Create a task from ${t.name}`" @click="useNow(t)">Use</UButton>
          <UButton size="sm" color="neutral" variant="ghost" :icon="editingId === t.id ? 'i-lucide-chevron-up' : 'i-lucide-pencil'"
            :aria-label="editingId === t.id ? 'Close editor' : `Edit ${t.name}`" @click="toggleEdit(t)" />
        </div>

        <form v-if="editingId === t.id && draft" class="border-t border-(--ui-border) px-3 py-3 space-y-4" @submit.prevent="save">
          <UFormField label="Template name">
            <UInput v-model="draft.name" size="md" class="w-full" />
          </UFormField>
          <UFormField label="Task title">
            <UInput v-model="draft.title" size="md" class="w-full" />
          </UFormField>
          <UFormField label="Details">
            <UTextarea v-model="draft.description" :rows="2" autoresize class="w-full" placeholder="Optional description" />
          </UFormField>

          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-2">Priority</p>
            <div class="flex gap-2 flex-wrap">
              <UButton v-for="p in priorityChoices" :key="p.value" size="sm" :icon="p.icon"
                :color="draft.priority === p.value ? 'primary' : 'neutral'" :variant="draft.priority === p.value ? 'solid' : 'outline'"
                @click="draft.priority = p.value">{{ p.label }}</UButton>
            </div>
          </div>

          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider">Tags</p>
              <TaskTagPicker v-model="draft.tags" label="Tags" />
            </div>
            <div class="flex items-center gap-2 flex-wrap">
              <UBadge v-for="(tag, i) in draft.tags" :key="tag" color="neutral" variant="subtle" size="sm" class="gap-1.5 py-1">
                {{ tag }}
                <button type="button" class="p-0.5 -mr-0.5 rounded-full" :aria-label="`Remove ${tag}`" @click="draft.tags.splice(i, 1)">&times;</button>
              </UBadge>
              <span v-if="!draft.tags.length" class="text-xs text-(--ui-text-dimmed)">No tags</span>
            </div>
          </div>

          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-2">Workspace</p>
            <div class="flex gap-2 flex-wrap">
              <UButton size="sm" :color="!draft.workspace_id ? 'primary' : 'neutral'" :variant="!draft.workspace_id ? 'solid' : 'outline'"
                @click="draft.workspace_id = null">Current</UButton>
              <UButton v-for="ws in workspaces" :key="ws.id" size="sm"
                :color="draft.workspace_id === ws.id ? 'primary' : 'neutral'" :variant="draft.workspace_id === ws.id ? 'solid' : 'outline'"
                @click="draft.workspace_id = ws.id">{{ ws.emoji }} {{ ws.name }}</UButton>
            </div>
            <p class="text-xs text-(--ui-text-muted) mt-1.5">Used when you create from “All” workspaces; otherwise the open workspace wins.</p>
          </div>

          <div>
            <p class="text-xs text-(--ui-text-dimmed) uppercase tracking-wider mb-2">Subtasks</p>
            <div class="space-y-1.5">
              <div v-for="(sub, i) in draft.subtasks" :key="i" class="flex items-center gap-1">
                <UInput v-model="sub.title" size="md" class="flex-1 min-w-0" :aria-label="`Subtask ${i + 1}`" />
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-up" :disabled="i === 0"
                  :aria-label="`Move subtask ${i + 1} up`" @click="moveSubtask(i, -1)" />
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-arrow-down" :disabled="i === draft.subtasks.length - 1"
                  :aria-label="`Move subtask ${i + 1} down`" @click="moveSubtask(i, 1)" />
                <UButton size="sm" color="neutral" variant="ghost" icon="i-lucide-x"
                  :aria-label="`Remove subtask ${i + 1}`" @click="draft.subtasks.splice(i, 1)" />
              </div>
              <div class="flex items-center gap-2">
                <UInput v-model="newSubtask" size="md" class="flex-1" placeholder="Add a subtask"
                  @keydown.enter.prevent="addSubtask" />
                <UButton size="sm" color="neutral" variant="soft" icon="i-lucide-plus" :disabled="!newSubtask.trim()" @click="addSubtask">Add</UButton>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 pt-1">
            <UButton color="error" variant="ghost" size="sm" icon="i-lucide-trash-2" @click="confirmDelete = true">Delete</UButton>
            <div class="flex-1" />
            <UButton color="neutral" variant="soft" size="sm" @click="cancelEdit">Cancel</UButton>
            <UButton type="submit" size="sm" :loading="saving" :disabled="!draft.name.trim() || !draft.title.trim()">Save</UButton>
          </div>
        </form>
      </div>
    </div>

    <UModal v-model:open="confirmDelete" title="Delete template?" :description="`“${draft?.name || ''}” is removed from your templates. Tasks already created from it stay.`">
      <template #footer>
        <div class="flex gap-3 w-full">
          <UButton color="neutral" variant="soft" class="flex-1" @click="confirmDelete = false">Cancel</UButton>
          <UButton color="error" class="flex-1" :loading="deleting" @click="remove">Delete</UButton>
        </div>
      </template>
    </UModal>
  </UCard>
</template>

<script setup lang="ts">
import type { TaskTemplate, TemplateSubtask } from '~/composables/useTemplates';
import { PRIORITY_OPTIONS } from '~/composables/usePriority';

const { templates, loaded, fetchTemplates, updateTemplate, deleteTemplate, instantiateTemplate } = useTemplates();
const { workspaces, activeId } = useWorkspace();
const toast = useToast();

onMounted(() => { fetchTemplates().catch(() => { loaded.value = true; }); });

const priorityChoices = [
  ...PRIORITY_OPTIONS.map(p => ({ value: p.value as number, label: p.label, icon: p.icon })),
  { value: 0, label: 'None', icon: 'i-lucide-minus' },
];

interface Draft {
  name: string;
  title: string;
  description: string;
  priority: number;
  tags: string[];
  workspace_id: string | null;
  subtasks: TemplateSubtask[];
}

const editingId = ref<string | null>(null);
const draft = ref<Draft | null>(null);
const newSubtask = ref('');
const saving = ref(false);
const deleting = ref(false);
const confirmDelete = ref(false);
const usingId = ref<string | null>(null);

function toggleEdit(t: TaskTemplate) {
  if (editingId.value === t.id) return cancelEdit();
  editingId.value = t.id;
  newSubtask.value = '';
  draft.value = {
    name: t.name,
    title: t.title,
    description: t.description,
    priority: t.priority,
    tags: [...t.tags],
    workspace_id: t.workspace_id,
    subtasks: t.subtasks.map(s => ({ ...s, tags: [...(s.tags || [])] })),
  };
}

function cancelEdit() {
  editingId.value = null;
  draft.value = null;
}

function addSubtask() {
  const title = newSubtask.value.trim();
  if (!title || !draft.value) return;
  draft.value.subtasks.push({ title, description: '', priority: null, tags: [] });
  newSubtask.value = '';
}

function moveSubtask(index: number, delta: number) {
  const list = draft.value?.subtasks;
  if (!list) return;
  const [item] = list.splice(index, 1);
  list.splice(index + delta, 0, item!);
}

async function save() {
  if (!editingId.value || !draft.value || saving.value) return;
  saving.value = true;
  try {
    await updateTemplate(editingId.value, {
      ...draft.value,
      subtasks: draft.value.subtasks.filter(s => s.title.trim()),
    });
    toast.add({ title: 'Template saved', color: 'success' });
    cancelEdit();
  } catch (err: any) {
    toast.add({ title: 'Template not saved', description: err?.data?.statusMessage || 'Try again.', color: 'error' });
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!editingId.value) return;
  deleting.value = true;
  try {
    await deleteTemplate(editingId.value);
    confirmDelete.value = false;
    cancelEdit();
    toast.add({ title: 'Template deleted', color: 'success' });
  } catch (err: any) {
    toast.add({ title: 'Template not deleted', description: err?.data?.statusMessage || 'Try again.', color: 'error' });
  } finally {
    deleting.value = false;
  }
}

async function useNow(t: TaskTemplate) {
  if (usingId.value) return;
  usingId.value = t.id;
  try {
    const task = await instantiateTemplate(t, { workspace_id: activeId.value ?? t.workspace_id });
    toast.add({
      title: `Created “${task.title}”`,
      color: 'success',
      actions: [{ label: 'Open', onClick: () => { navigateTo(`/tasks/${task.id}`); } }],
    });
  } catch {
    toast.add({ title: 'Template could not be used', description: 'Some tasks may have been created; check Tasks.', color: 'error' });
  } finally {
    usingId.value = null;
  }
}
</script>
