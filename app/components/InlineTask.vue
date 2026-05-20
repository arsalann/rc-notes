<template>
  <div v-if="task" class="my-3 rounded-xl ring-2 bg-teal-900/80 overflow-hidden"
    :class="priority ? priority.ringClass : 'ring-teal-600/60'">
    <div class="flex items-center gap-2.5 px-3 py-2.5">
      <UCheckbox :model-value="task.completed" @update:model-value="handleToggle" size="sm" />
      <UIcon v-if="priority" :name="priority.icon" class="size-4 shrink-0" :class="priority.textClass" />
      <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 min-w-0">
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

const props = defineProps<{ taskId: string; initialData?: Task & { subtasks?: Task[] }; hideDoneSubtasks?: boolean }>();
const emit = defineEmits<{ 'update:completed': [{ id: string; completed: boolean }] }>();
const { toggleComplete, createTask } = useTasks();
const { activeId } = useWorkspace();

const task = ref<Task | null>(props.initialData || null);
const subtasks = ref<Task[]>(props.initialData?.subtasks || []);
const loading = ref(!props.initialData);
const expanded = ref((props.initialData?.subtasks?.length || 0) > 0);
const newSubtask = ref('');
const addingSubtask = ref(false);

const priority = computed(() => getPriorityOption(task.value?.priority));
const visibleSubtasks = computed(() =>
  props.hideDoneSubtasks ? subtasks.value.filter(s => !s.completed) : subtasks.value
);

onMounted(async () => {
  if (props.initialData) {
    emit('update:completed', { id: props.taskId, completed: !!props.initialData.completed });
    return;
  }
  try {
    const data = await $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${props.taskId}`);
    task.value = data;
    subtasks.value = data.subtasks || [];
    if (subtasks.value.length) expanded.value = true;
    emit('update:completed', { id: props.taskId, completed: !!data.completed });
  } catch { /* task may not exist */ }
  finally { loading.value = false; }
});

async function handleToggle() {
  if (!task.value) return;
  const u = await toggleComplete(task.value.id);
  task.value = { ...task.value, ...u };
  emit('update:completed', { id: props.taskId, completed: !!task.value.completed });
}

async function handleSubToggle(sid: string) {
  const u = await toggleComplete(sid);
  const i = subtasks.value.findIndex(s => s.id === sid);
  if (i >= 0) subtasks.value[i] = { ...subtasks.value[i], ...u };
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
