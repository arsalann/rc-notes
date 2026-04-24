<template>
  <div class="max-w-lg mx-auto md:max-w-6xl">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold tracking-tight">{{ showArchived ? 'Archived' : 'Tasks' }}</h1>
          <WorkspaceSwitcher />
        </div>
        <div class="flex items-center gap-1">
          <UButton :icon="showArchived ? 'i-lucide-archive-restore' : 'i-lucide-archive'" color="neutral"
            :variant="showArchived ? 'soft' : 'ghost'" size="sm" @click="toggleArchived" />
          <UButton icon="i-lucide-calendar" color="neutral" variant="ghost" size="sm" to="/calendar" />
        </div>
      </div>
      <!-- Toolbar -->
      <div class="flex items-center gap-1.5 mt-3 overflow-x-auto no-scrollbar scroll-hint pb-0.5">
        <UButton :color="showDone ? 'primary' : 'neutral'" :variant="showDone ? 'soft' : 'outline'" size="xs"
          :icon="showDone ? 'i-lucide-eye' : 'i-lucide-eye-off'" @click="showDone = !showDone" class="shrink-0">
          Done
        </UButton>
        <USeparator orientation="vertical" class="h-4 shrink-0" />
        <UButton :color="orderBy === 'created' ? 'primary' : 'neutral'" :variant="orderBy === 'created' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-clock" @click="orderBy = 'created'" class="shrink-0">
          Newest
        </UButton>
        <UButton :color="orderBy === 'due' ? 'primary' : 'neutral'" :variant="orderBy === 'due' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-calendar" @click="orderBy = 'due'" class="shrink-0">
          Due
        </UButton>
        <USeparator orientation="vertical" class="h-4 shrink-0" />
        <UButton :color="groupBy === 'tag' ? 'primary' : 'neutral'" :variant="groupBy === 'tag' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-tags" @click="groupBy = groupBy === 'tag' ? 'none' : 'tag'" class="shrink-0">
          Tag
        </UButton>
        <UButton :color="groupBy === 'workspace' ? 'primary' : 'neutral'" :variant="groupBy === 'workspace' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-folder" @click="groupBy = groupBy === 'workspace' ? 'none' : 'workspace'" class="shrink-0">
          Space
        </UButton>
        <UButton :color="groupBy === 'status' ? 'primary' : 'neutral'" :variant="groupBy === 'status' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-circle-dot" @click="groupBy = groupBy === 'status' ? 'none' : 'status'" class="shrink-0">
          Status
        </UButton>
        <UButton :color="groupBy === 'priority' ? 'primary' : 'neutral'" :variant="groupBy === 'priority' ? 'soft' : 'outline'" size="xs"
          icon="i-lucide-flame" @click="groupBy = groupBy === 'priority' ? 'none' : 'priority'" class="shrink-0">
          Priority
        </UButton>
      </div>
    </div>
    <div v-if="!showArchived" class="mt-2">
      <QuickAdd placeholder="What needs to be done?" @add="handleAdd" />
    </div>
    <div v-if="loading" class="px-4 mt-4 space-y-3">
      <USkeleton v-for="i in 4" :key="i" class="h-18 w-full" />
    </div>
    <template v-else>
      <!-- Desktop Status Kanban -->
      <div v-if="groupBy === 'none' || groupBy === 'status'" class="hidden md:block mt-4 px-4 pb-6">
        <div class="grid grid-cols-3 gap-4">
          <div v-for="col in kanbanColumns" :key="col.status"
            class="bg-(--ui-bg-elevated)/30 rounded-2xl p-3 min-h-[60vh]">
            <div class="flex items-center gap-2 mb-3 px-1">
              <div class="size-2 rounded-full"
                :class="col.status === 'now' ? 'bg-purple-500' : col.status === 'done' ? 'bg-emerald-500' : 'bg-zinc-500'" />
              <span class="text-sm font-semibold"
                :class="col.status === 'now' ? 'text-(--ui-primary)' : col.status === 'done' ? 'text-emerald-400' : 'text-(--ui-text-dimmed)'">
                {{ col.label }}
              </span>
              <span class="text-xs text-(--ui-text-muted)">{{ col.tasks.length }}</span>
            </div>
            <draggable
              :list="col.tasks"
              :group="{ name: 'kanban', pull: true, put: true }"
              item-key="id"
              :animation="200"
              ghost-class="opacity-30"
              drag-class="ring-2 ring-(--ui-primary) rounded-2xl"
              class="space-y-2 min-h-12"
              @change="(e: any) => handleKanbanDrop(e, col.status)">
              <template #item="{ element }">
                <TaskItem :task="element" @toggle="handleToggle" />
              </template>
            </draggable>
          </div>
        </div>
      </div>
      <!-- Desktop Priority Kanban -->
      <div v-else-if="groupBy === 'priority'" class="hidden md:block mt-4 px-4 pb-6">
        <div class="grid grid-cols-4 gap-4">
          <div v-for="col in priorityKanbanColumns" :key="col.key"
            class="bg-(--ui-bg-elevated)/30 rounded-2xl p-3 min-h-[60vh]">
            <div class="flex items-center gap-2 mb-3 px-1">
              <UIcon :name="col.icon" class="size-3.5" :class="col.textClass" />
              <span class="text-sm font-semibold" :class="col.textClass">{{ col.label }}</span>
              <span class="text-xs text-(--ui-text-muted)">{{ col.tasks.length }}</span>
            </div>
            <draggable
              :list="col.tasks"
              :group="{ name: 'priority-kanban', pull: true, put: true }"
              item-key="id"
              :animation="200"
              ghost-class="opacity-30"
              drag-class="ring-2 ring-(--ui-primary) rounded-2xl"
              class="space-y-2 min-h-12"
              @change="(e: any) => handlePriorityDrop(e, col.value)">
              <template #item="{ element }">
                <TaskItem :task="element" @toggle="handleToggle" />
              </template>
            </draggable>
          </div>
        </div>
      </div>
      <!-- List Views — always visible on mobile; on desktop, visible when a non-kanban group is active -->
      <div :class="(groupBy === 'none' || groupBy === 'status' || groupBy === 'priority') ? 'md:hidden' : ''">
        <template v-if="sortedTasks.length">
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
                  <div class="flex items-start gap-0">
                    <div class="drag-handle cursor-grab active:cursor-grabbing py-3 px-2 text-(--ui-text-dimmed) active:text-(--ui-text-muted) transition-colors touch-none">
                      <UIcon name="i-lucide-grip-vertical" class="size-5" />
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
          <!-- Grouped by status -->
          <template v-else-if="groupBy === 'status'">
            <div v-for="group in statusGroups" :key="group.status" class="px-4 mt-4">
              <p class="text-xs font-semibold uppercase tracking-wider mb-2"
                :class="group.status === 'now' ? 'text-(--ui-primary)' : 'text-(--ui-text-dimmed)'">
                {{ group.label }}
              </p>
              <div class="space-y-2.5">
                <TaskItem v-for="task in group.tasks" :key="task.id" :task="task" @toggle="handleToggle" />
              </div>
            </div>
            <div class="pb-6" />
          </template>
          <!-- Grouped by priority -->
          <template v-else-if="groupBy === 'priority'">
            <div v-for="group in priorityGroups" :key="group.key" class="px-4 mt-4">
              <p class="text-xs font-semibold uppercase tracking-wider mb-2" :class="group.labelClass || 'text-(--ui-text-dimmed)'">
                <UIcon v-if="group.icon" :name="group.icon" class="size-3.5 mr-1 align-[-2px]" />
                {{ group.label }}
              </p>
              <div class="space-y-2.5">
                <TaskItem v-for="task in group.tasks" :key="task.id" :task="task" @toggle="handleToggle" />
              </div>
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
                <div class="flex items-start gap-0">
                  <div class="drag-handle cursor-grab active:cursor-grabbing py-3 px-2 text-(--ui-text-dimmed) active:text-(--ui-text-muted) transition-colors touch-none">
                    <UIcon name="i-lucide-grip-vertical" class="size-5" />
                  </div>
                  <div class="flex-1 min-w-0">
                    <TaskItem :task="element" @toggle="handleToggle" />
                  </div>
                </div>
              </template>
            </draggable>
          </div>
        </template>
        <EmptyState v-else :message="showArchived ? 'No archived tasks.' : showDone ? 'No tasks yet — add one above.' : 'No open tasks. Toggle &quot;Done&quot; to see completed.'" :icon="showArchived ? 'i-lucide-archive' : 'i-lucide-circle-check'" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import draggable from 'vuedraggable';
import type { Task } from '~/composables/useNotes';
import { parseUTC } from '~/composables/useDate';
import { PRIORITY_OPTIONS } from '~/composables/usePriority';

const { tasks, loading, fetchTasks, createTask, toggleComplete, updateTask } = useTasks();
const { activeId, workspaces } = useWorkspace();
const { prefs } = usePreferences();

const showDone = ref(prefs.value.taskShowDone);
const orderBy = ref<'created' | 'due'>(prefs.value.taskOrderBy);
const groupBy = ref<'none' | 'workspace' | 'tag' | 'status' | 'priority'>(prefs.value.taskGroupBy);
const showArchived = ref(false);

async function load() { await fetchTasks({ workspace_id: activeId.value, archived: showArchived.value }); }
onMounted(load); watch(activeId, load);
function toggleArchived() { showArchived.value = !showArchived.value; load(); }

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
      return parseUTC(a.due_at).getTime() - parseUTC(b.due_at).getTime();
    });
  }
  // 'created' — incomplete first, pinned first, then newest
  return list.sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    return parseUTC(b.created_at).getTime() - parseUTC(a.created_at).getTime();
  });
});

// Mutable copy for flat-list drag reorder
const draggableTasks = ref<Task[]>([]);
watch(sortedTasks, (val) => { draggableTasks.value = [...val]; }, { immediate: true });

// Desktop kanban columns (mutable for drag-drop)
const kanbanColumns = ref<{ status: string; label: string; tasks: Task[] }[]>([]);

function buildKanbanColumns() {
  const cols: { status: string; label: string; tasks: Task[] }[] = [
    { status: 'next', label: 'Next', tasks: [] },
    { status: 'now', label: 'Now', tasks: [] },
    { status: 'done', label: 'Done', tasks: [] },
  ];
  for (const task of sortedTasks.value) {
    const s = task.status || 'next';
    const col = cols.find(c => c.status === s);
    if (col) col.tasks.push({ ...task });
  }
  kanbanColumns.value = cols;
}

watch(sortedTasks, buildKanbanColumns, { immediate: true });

async function handleKanbanDrop(e: any, targetStatus: string) {
  if (!e.added) return;
  const task = e.added.element;
  await updateTask(task.id, { status: targetStatus } as any);
  const idx = tasks.value.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    tasks.value[idx] = { ...tasks.value[idx], status: targetStatus, completed: targetStatus === 'done' };
  }
}

// Priority kanban (mirrors status kanban)
const priorityKanbanColumns = ref<{ key: string; value: number; label: string; icon: string; textClass: string; tasks: Task[] }[]>([]);

function buildPriorityKanbanColumns() {
  const cols = [
    ...PRIORITY_OPTIONS.map(p => ({ key: `p${p.value}`, value: p.value, label: p.label, icon: p.icon, textClass: p.textClass, tasks: [] as Task[] })),
    { key: 'p0', value: 0, label: 'None', icon: 'i-lucide-minus', textClass: 'text-(--ui-text-dimmed)', tasks: [] as Task[] },
  ];
  for (const task of sortedTasks.value) {
    const p = task.priority ?? 0;
    const col = cols.find(c => c.value === p);
    if (col) col.tasks.push({ ...task });
  }
  priorityKanbanColumns.value = cols;
}

watch(sortedTasks, buildPriorityKanbanColumns, { immediate: true });

async function handlePriorityDrop(e: any, targetPriority: number) {
  if (!e.added) return;
  const task = e.added.element;
  await updateTask(task.id, { priority: targetPriority } as any);
  const idx = tasks.value.findIndex(t => t.id === task.id);
  if (idx >= 0) {
    tasks.value[idx] = { ...tasks.value[idx], priority: targetPriority };
  }
}

const statusGroups = computed(() => {
  const order = ['now', 'next', 'done'];
  const labels: Record<string, string> = { now: 'Now', next: 'Next', done: 'Done' };
  const groups = new Map<string, Task[]>();
  for (const s of order) groups.set(s, []);
  for (const task of sortedTasks.value) {
    const s = task.status || 'next';
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s)!.push(task);
  }
  return order.filter(s => groups.get(s)!.length).map(s => ({ label: labels[s] || s, status: s, tasks: groups.get(s)! }));
});

const priorityGroups = computed(() => {
  const map = new Map<number, Task[]>();
  for (const task of sortedTasks.value) {
    const p = task.priority ?? 0;
    if (!map.has(p)) map.set(p, []);
    map.get(p)!.push(task);
  }
  const out: { key: string; label: string; tasks: Task[]; icon?: string; labelClass?: string }[] = [];
  for (const opt of PRIORITY_OPTIONS) {
    const list = map.get(opt.value);
    if (list?.length) out.push({ key: `p${opt.value}`, label: opt.label, tasks: list, icon: opt.icon, labelClass: opt.textClass });
  }
  const none = map.get(0);
  if (none?.length) out.push({ key: 'p0', label: 'No priority', tasks: none, icon: 'i-lucide-minus' });
  return out;
});

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

async function handleAdd(data: { title: string; due_at?: string; subtasks?: string[]; tags?: string[]; priority?: number; status?: string }) {
  const task = await createTask({ ...data, workspace_id: activeId.value });
  if (data.subtasks?.length) {
    for (const sub of data.subtasks) await createTask({ title: sub, parent_id: task.id, workspace_id: activeId.value });
    await load();
  }
}
async function handleToggle(id: string) {
  const updated = await toggleComplete(id);
  // Update status in local state so grouping reflects the change
  const idx = tasks.value.findIndex(t => t.id === id);
  if (idx >= 0) tasks.value[idx] = { ...tasks.value[idx], ...updated };
}
</script>
