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
        <UButton :color="orderBy === 'created' ? 'primary' : 'neutral'" :variant="orderBy === 'created' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-clock" @click="orderBy = 'created'">
          Newest
        </UButton>
        <UButton :color="orderBy === 'due' ? 'primary' : 'neutral'" :variant="orderBy === 'due' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-calendar" @click="orderBy = 'due'">
          Due date
        </UButton>
        <USeparator orientation="vertical" class="h-4" />
        <UButton :color="groupBy === 'tag' ? 'primary' : 'neutral'" :variant="groupBy === 'tag' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-tags" @click="groupBy = groupBy === 'tag' ? 'none' : 'tag'">
          By tag
        </UButton>
        <UButton :color="groupBy === 'workspace' ? 'primary' : 'neutral'" :variant="groupBy === 'workspace' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-folder" @click="groupBy = groupBy === 'workspace' ? 'none' : 'workspace'">
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
    <template v-else-if="sortedTasks.length">
      <!-- Grouped by workspace (draggable between groups) -->
      <template v-if="groupBy === 'workspace'">
        <div v-for="group in workspaceGroupsLive.filter(g => g.tasks.length)" :key="group.wsId ?? '__none__'" class="px-4 mt-4">
          <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-2">{{ group.label }}</p>
          <draggable
            :list="group.tasks"
            :group="{ name: 'workspace-tasks', pull: true, put: true }"
            item-key="id"
            :animation="200"
            ghost-class="opacity-30"
            drag-class="ring-2 ring-(--ui-primary) rounded-2xl"
            handle=".drag-handle"
            class="space-y-2.5 min-h-8"
            @change="(e: any) => handleWorkspaceDrop(e, group.wsId)">
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
        <div class="pb-6" />
      </template>
      <!-- Grouped by tag -->
      <template v-else-if="groupBy === 'tag'">
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
const orderBy = ref<'created' | 'due'>('created');
const groupBy = ref<'none' | 'workspace' | 'tag'>('workspace');

async function load() { await fetchTasks({ workspace_id: activeId.value }); }
onMounted(load); watch(activeId, load);

// Step 1: filter
const filteredTasks = computed(() => {
  let list = tasks.value;
  if (!showDone.value) list = list.filter(t => !t.completed);
  return list;
});

// Step 2: sort (applied independently of grouping)
const sortedTasks = computed(() => {
  const list = [...filteredTasks.value];
  if (orderBy.value === 'due') {
    return list.sort((a, b) => {
      if (!a.due_at && !b.due_at) return 0;
      if (!a.due_at) return 1;
      if (!b.due_at) return -1;
      return new Date(a.due_at).getTime() - new Date(b.due_at).getTime();
    });
  }
  // 'created' — incomplete first, pinned first, then newest
  return list.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
});

// Mutable copy for flat-list drag reorder
const draggableTasks = ref<Task[]>([]);
watch(sortedTasks, (val) => { draggableTasks.value = [...val]; }, { immediate: true });

const tagGroups = computed(() => {
  const groups = new Map<string, Task[]>();
  for (const task of sortedTasks.value) {
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
  for (const task of sortedTasks.value) {
    const key = task.workspace_id || null;
    if (!groups.has(key)) {
      groups.set(key, { label: 'No workspace', wsId: null, tasks: [] });
    }
    groups.get(key)!.tasks.push({ ...task });
  }
  workspaceGroupsLive.value = [...groups.values()];
}

watch([sortedTasks, groupBy], () => {
  if (groupBy.value === 'workspace') buildWorkspaceGroups();
}, { immediate: true });

async function handleWorkspaceDrop(e: any, targetWsId: string | null) {
  // Only act when an item is added to this group (not removed from it)
  if (!e.added) return;
  const task = e.added.element;
  await updateTask(task.id, { workspace_id: targetWsId } as any);
  const idx = tasks.value.findIndex(t => t.id === task.id);
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
