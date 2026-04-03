<template>
  <div class="max-w-lg mx-auto">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold tracking-tight">Tasks</h1>
        <WorkspaceSwitcher />
      </div>
      <!-- Toolbar -->
      <div class="flex items-center gap-2 mt-3 overflow-x-auto no-scrollbar">
        <UButton :color="showDone ? 'primary' : 'neutral'" :variant="showDone ? 'soft' : 'outline'" size="xs"
          :icon="showDone ? 'i-lucide-eye' : 'i-lucide-eye-off'" @click="showDone = !showDone">
          Done
        </UButton>
        <USeparator orientation="vertical" class="h-4" />
        <UButton :color="sortMode === 'created' ? 'primary' : 'neutral'" :variant="sortMode === 'created' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-clock" @click="sortMode = 'created'">
          Newest
        </UButton>
        <UButton :color="sortMode === 'due' ? 'primary' : 'neutral'" :variant="sortMode === 'due' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-calendar" @click="sortMode = 'due'">
          Due date
        </UButton>
        <UButton :color="sortMode === 'tag' ? 'primary' : 'neutral'" :variant="sortMode === 'tag' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-tags" @click="sortMode = sortMode === 'tag' ? 'created' : 'tag'">
          By tag
        </UButton>
        <UButton :color="sortMode === 'workspace' ? 'primary' : 'neutral'" :variant="sortMode === 'workspace' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-folder" @click="sortMode = sortMode === 'workspace' ? 'created' : 'workspace'">
          By space
        </UButton>
      </div>
    </div>
    <div class="mt-2">
      <QuickAdd placeholder="What needs to be done?" @add="handleAdd" />
    </div>
    <div v-if="loading" class="px-4 mt-4 space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-18 w-full" />
    </div>
    <template v-else-if="filteredTasks.length">
      <!-- Grouped by workspace (draggable between groups) -->
      <template v-if="sortMode === 'workspace'">
        <div v-for="group in workspaceGroupsLive" :key="group.wsId ?? '__none__'" class="px-4 mt-4">
          <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2">{{ group.label }}</p>
          <draggable
            :list="group.tasks"
            group="workspace-tasks"
            item-key="id"
            :animation="200"
            ghost-class="opacity-30"
            drag-class="ring-2 ring-(--ui-primary) rounded-2xl"
            class="space-y-2.5 min-h-8"
            @end="(e: any) => handleWorkspaceDrop(e, group.wsId)">
            <template #item="{ element }">
              <TaskItem :task="element" @toggle="handleToggle" />
            </template>
          </draggable>
        </div>
        <div class="pb-6" />
      </template>
      <!-- Grouped by tag -->
      <template v-else-if="sortMode === 'tag'">
        <div v-for="group in tagGroups" :key="group.label" class="px-4 mt-4">
          <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2">{{ group.label }}</p>
          <div class="space-y-2.5">
            <TaskItem v-for="task in group.tasks" :key="task.id" :task="task" @toggle="handleToggle" />
          </div>
        </div>
        <div class="pb-6" />
      </template>
      <!-- Flat list (draggable for reorder) -->
      <div v-else class="px-4 mt-4 pb-6">
        <draggable
          :list="draggableTasks"
          item-key="id"
          :animation="200"
          ghost-class="opacity-30"
          drag-class="ring-2 ring-(--ui-primary) rounded-2xl"
          handle=".drag-handle"
          class="space-y-2.5"
          @end="handleReorder">
          <template #item="{ element }">
            <div class="flex items-start gap-1">
              <div class="drag-handle cursor-grab active:cursor-grabbing pt-4 px-1 text-(--ui-text-dimmed) hover:text-(--ui-text-muted) transition-colors">
                <UIcon name="i-lucide-grip-vertical" class="size-4" />
              </div>
              <div class="flex-1 min-w-0">
                <TaskItem :task="element" @toggle="handleToggle" />
              </div>
            </div>
          </template>
        </draggable>
      </div>
    </template>
    <EmptyState v-else :message="showDone ? 'No tasks yet — add one above.' : 'No open tasks. Toggle &quot;Done&quot; to see completed.'" icon="i-lucide-circle-check" />
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable';
import type { Task } from '~/composables/useNotes';

const { tasks, loading, fetchTasks, createTask, toggleComplete, updateTask } = useTasks();
const { activeId, workspaces } = useWorkspace();

const showDone = ref(true);
const sortMode = ref<'created' | 'due' | 'tag' | 'workspace'>('created');

async function load() { await fetchTasks({ workspace_id: activeId.value }); }
onMounted(load); watch(activeId, load);

const filteredTasks = computed(() => {
  let list = tasks.value;
  if (!showDone.value) list = list.filter(t => !t.completed);

  if (sortMode.value === 'due') {
    return [...list].sort((a, b) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  }
  if (sortMode.value === 'created') {
    return [...list].sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }
  return list;
});

// Mutable copy for flat-list drag reorder
const draggableTasks = ref<Task[]>([]);
watch(filteredTasks, (val) => { draggableTasks.value = [...val]; }, { immediate: true });

const tagGroups = computed(() => {
  const groups = new Map<string, Task[]>();
  for (const task of filteredTasks.value) {
    const tags = task.tags?.length ? task.tags : ['Untagged'];
    for (const tag of tags) {
      if (!groups.has(tag)) groups.set(tag, []);
      groups.get(tag)!.push(task);
    }
  }
  return [...groups.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, tasks]) => ({ label, tasks }));
});

// Mutable workspace groups for drag between groups
const workspaceGroupsLive = ref<{ label: string; wsId: string | null; tasks: Task[] }[]>([]);

function buildWorkspaceGroups() {
  const groups = new Map<string | null, { label: string; wsId: string | null; tasks: Task[] }>();
  // Pre-create groups for all workspaces so empty ones are drop targets
  groups.set(null, { label: 'No workspace', wsId: null, tasks: [] });
  for (const ws of workspaces.value) {
    groups.set(ws.id, { label: `${ws.emoji} ${ws.name}`, wsId: ws.id, tasks: [] });
  }
  for (const task of filteredTasks.value) {
    const key = task.workspace_id || null;
    if (!groups.has(key)) {
      groups.set(key, { label: 'No workspace', wsId: null, tasks: [] });
    }
    groups.get(key)!.tasks.push({ ...task });
  }
  workspaceGroupsLive.value = [...groups.values()];
}

watch([filteredTasks, () => sortMode.value], () => {
  if (sortMode.value === 'workspace') buildWorkspaceGroups();
}, { immediate: true });

async function handleWorkspaceDrop(e: any, targetWsId: string | null) {
  // Find the task that was moved
  const taskId = e.item?.__draggable_context?.element?.id;
  if (!taskId) return;
  // Update workspace on the server
  await updateTask(taskId, { workspace_id: targetWsId } as any);
  // Update local state
  const idx = tasks.value.findIndex(t => t.id === taskId);
  if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], workspace_id: targetWsId };
}

async function handleReorder() {
  // Save new positions
  for (let i = 0; i < draggableTasks.value.length; i++) {
    const task = draggableTasks.value[i];
    if (task.position !== i) {
      updateTask(task.id, { position: i } as any);
      task.position = i;
      const idx = tasks.value.findIndex(t => t.id === task.id);
      if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], position: i };
    }
  }
}

async function handleAdd(data: { title: string; due_at?: string; subtasks?: string[] }) {
  const task = await createTask({ ...data, workspace_id: activeId.value });
  if (data.subtasks?.length) {
    for (const sub of data.subtasks) await createTask({ title: sub, parent_id: task.id, workspace_id: activeId.value });
    await load();
  }
}
async function handleToggle(id: string) { await toggleComplete(id); }
</script>
