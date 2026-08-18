<template>
  <div v-if="task"
    :class="variant === 'after-hours'
      ? 'after-hours-inline-task'
      : ['my-3 rounded-xl ring-2 bg-teal-900/80 overflow-hidden', priority ? priority.ringClass : 'ring-teal-600/60']">
    <div class="flex items-center gap-2.5 px-3 py-2.5">
      <UCheckbox :model-value="task.completed" @update:model-value="handleToggle" size="sm" />
      <UIcon v-if="priority" :name="priority.icon" class="size-4 shrink-0" :class="priority.textClass" />
      <TaskTagIcons :tags="task.resolved_tags" />
      <!-- While a create is in flight the row exists only locally, so navigating would 404. -->
      <span v-if="isPending" class="flex-1 min-w-0">
        <span class="text-sm font-medium opacity-70">{{ task.title }}</span>
      </span>
      <NuxtLink v-else :to="`/tasks/${task.id}`" class="flex-1 min-w-0">
        <span class="text-sm font-medium" :class="task.completed && 'line-through text-(--ui-text-muted)'">{{ task.title }}</span>
      </NuxtLink>
      <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">{{ task.display_id }}</UBadge>
      <UButton color="neutral" variant="ghost" size="xs"
        :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
        @click.prevent="expanded = !expanded" class="shrink-0" />
    </div>
    <div v-if="expanded" class="border-t border-(--ui-border) px-3 py-1.5">
      <div v-for="sub in visibleSubtasks" :key="sub.id" class="flex items-center gap-2 py-1.5 pl-4">
        <UCheckbox :model-value="sub.completed" @update:model-value="handleSubToggle(sub.id)" />
        <UIcon v-if="subPriority(sub)" :name="subPriority(sub)?.icon" class="size-3.5 shrink-0" :class="subPriority(sub)?.textClass" />
        <TaskTagIcons :tags="sub.resolved_tags" />
        <NuxtLink :to="`/tasks/${sub.id}`" class="flex-1 min-w-0">
          <span class="text-sm" :class="sub.completed && 'line-through text-(--ui-text-muted)'">{{ sub.title }}</span>
        </NuxtLink>
      </div>
      <form @submit.prevent="addSubtask" class="flex items-center gap-2 py-1.5 pl-4">
        <UIcon name="i-lucide-circle-dashed" class="size-4 text-(--ui-text-dimmed) shrink-0" />
        <input v-model="newSubtask" placeholder="Add a subtask..."
          class="flex-1 bg-transparent outline-none text-sm text-(--ui-text-muted) placeholder:text-(--ui-text-dimmed)" />
        <UButton v-if="newSubtask.trim()" type="submit" color="primary" variant="ghost" size="xs" :loading="addingSubtask">Add</UButton>
      </form>
    </div>
  </div>
  <div v-else-if="loading" class="my-3 flex items-center gap-2 px-3 py-2.5 rounded-xl ring-1 ring-(--ui-border) bg-(--ui-bg-elevated)">
    <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-(--ui-text-dimmed)" />
    <span class="text-xs text-(--ui-text-dimmed)">Loading task...</span>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useNotes';
import { getPriorityOption } from '~/composables/usePriority';

const props = withDefaults(defineProps<{
  taskId: string;
  initialData?: Task & { subtasks?: Task[] };
  hideDoneSubtasks?: boolean;
  /** Incremented by a parent view when every task's subtask list should change together. */
  subtaskExpansionToken?: number;
  /** The expansion state to apply when subtaskExpansionToken changes. */
  subtasksExpanded?: boolean;
  variant?: 'default' | 'after-hours';
}>(), { variant: 'default', subtaskExpansionToken: 0, subtasksExpanded: true });
const emit = defineEmits<{ 'update:completed': [{ id: string; completed: boolean }] }>();
const { toggleComplete, createTask } = useTasks();
const { activeId } = useWorkspace();
// A silent rollback is worse than a slow update, so every failure branch below surfaces a toast.
const toast = useToast();

const task = ref<Task | null>(props.initialData || null);
const subtasks = ref<Task[]>(props.initialData?.subtasks || []);
const loading = ref(!props.initialData);
const expanded = ref(props.subtasksExpanded && (props.initialData?.subtasks?.length || 0) > 0);
const newSubtask = ref('');
const addingSubtask = ref(false);

/** Set by an optimistic create until the server confirms the row. */
const isPending = computed(() => !!(task.value as any)?._pending);

const priority = computed(() => getPriorityOption(task.value?.priority));
const subPriority = (subtask: Task) => getPriorityOption(subtask.priority);
const visibleSubtasks = computed(() =>
  props.hideDoneSubtasks ? subtasks.value.filter(s => !s.completed) : subtasks.value
);

watch(() => props.subtaskExpansionToken, (token) => {
  if (token) expanded.value = props.subtasksExpanded && subtasks.value.length > 0;
});

// `task` is seeded from initialData once, so without this a later cache update never reaches the
// component — an optimistically-created row would stay flagged `_pending` (and unlinkable) forever
// after the server confirmed it.
watch(() => props.initialData, (fresh) => {
  if (!fresh) return;
  task.value = fresh;
  if (fresh.subtasks) subtasks.value = fresh.subtasks;
  loading.value = false;
});

onMounted(async () => {
  if (props.initialData) {
    emit('update:completed', { id: props.taskId, completed: !!props.initialData.completed });
    return;
  }
  try {
    const data = await $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${props.taskId}`);
    task.value = data;
    subtasks.value = data.subtasks || [];
    expanded.value = props.subtasksExpanded && subtasks.value.length > 0;
    emit('update:completed', { id: props.taskId, completed: !!data.completed });
  } catch { /* task may not exist */ }
  finally { loading.value = false; }
});

/**
 * Optimistic completion toggle. Paints the new state, sends the explicit target, and on failure
 * refetches the row rather than inverting the flag back — a timeout can mean the write landed.
 * In-flight guards stop a double-tap from racing itself.
 */
const togglingIds = ref(new Set<string>());

async function handleToggle() {
  const current = task.value;
  // Pending rows have no server-side row yet, so a toggle would 404.
  if (!current || isPending.value || togglingIds.value.has(current.id)) return;
  const target = !current.completed;

  togglingIds.value = new Set(togglingIds.value).add(current.id);
  task.value = { ...current, completed: target };
  emit('update:completed', { id: props.taskId, completed: target });

  try {
    const u = await toggleComplete(current.id, target);
    task.value = { ...current, ...u };
    emit('update:completed', { id: props.taskId, completed: !!u.completed });
  } catch {
    const fresh = await $fetch<Task & { subtasks?: Task[] }>(`/api/tasks/${current.id}`).catch(() => null);
    if (fresh) {
      task.value = fresh;
      emit('update:completed', { id: props.taskId, completed: !!fresh.completed });
    } else {
      task.value = current;
      emit('update:completed', { id: props.taskId, completed: !!current.completed });
    }
    toast.add({ title: 'Could not update that task', description: 'Showing the saved state.', color: 'error' });
  } finally {
    const next = new Set(togglingIds.value);
    next.delete(current.id);
    togglingIds.value = next;
  }
}

async function handleSubToggle(sid: string) {
  const i = subtasks.value.findIndex(s => s.id === sid);
  if (i < 0 || togglingIds.value.has(sid)) return;
  const original = subtasks.value[i]!;
  const target = !original.completed;

  togglingIds.value = new Set(togglingIds.value).add(sid);
  subtasks.value[i] = { ...original, completed: target };

  try {
    const u = await toggleComplete(sid, target);
    subtasks.value[i] = { ...original, ...u };
  } catch {
    const fresh = await $fetch<Task>(`/api/tasks/${sid}`).catch(() => null);
    subtasks.value[i] = fresh ? { ...original, ...fresh } : original;
    toast.add({ title: 'Could not update that subtask', description: 'Showing the saved state.', color: 'error' });
  } finally {
    const next = new Set(togglingIds.value);
    next.delete(sid);
    togglingIds.value = next;
  }
}

async function addSubtask() {
  const title = newSubtask.value.trim();
  if (!title || !task.value || addingSubtask.value) return;
  addingSubtask.value = true;
  try {
    const sub = await createTask({ title, parent_id: task.value.id, workspace_id: activeId.value });
    subtasks.value.push(sub);
    newSubtask.value = '';
  } finally { addingSubtask.value = false; }
}
</script>
