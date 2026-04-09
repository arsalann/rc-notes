<template>
  <div v-if="task" class="my-3 rounded-xl ring-2 ring-teal-600/60 bg-teal-900/80 overflow-hidden">
    <div class="flex items-center gap-2.5 px-3 py-2.5">
      <UCheckbox :model-value="task.completed" @update:model-value="handleToggle" size="sm" />
      <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 min-w-0">
        <span class="text-sm font-medium" :class="task.completed && 'line-through text-(--ui-text-muted)'">{{ task.title }}</span>
      </NuxtLink>
      <UBadge color="neutral" variant="subtle" size="xs" class="font-mono">{{ task.display_id }}</UBadge>
    </div>
    <div v-if="subtasks.length" class="border-t border-(--ui-border) px-3 py-1.5">
      <div v-for="sub in subtasks" :key="sub.id" class="flex items-center gap-2 py-1.5 pl-4">
        <UCheckbox :model-value="sub.completed" @update:model-value="handleSubToggle(sub.id)" />
        <span class="text-sm" :class="sub.completed && 'line-through text-(--ui-text-muted)'">{{ sub.title }}</span>
      </div>
    </div>
  </div>
  <div v-else-if="loading" class="my-3 flex items-center gap-2 px-3 py-2.5 rounded-xl ring-1 ring-(--ui-border) bg-(--ui-bg-elevated)">
    <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-(--ui-text-dimmed)" />
    <span class="text-xs text-(--ui-text-dimmed)">Loading task...</span>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useNotes';

const props = defineProps<{ taskId: string; initialData?: Task & { subtasks?: Task[] } }>();
const { toggleComplete } = useTasks();

const task = ref<Task | null>(props.initialData || null);
const subtasks = ref<Task[]>(props.initialData?.subtasks || []);
const loading = ref(!props.initialData);

onMounted(async () => {
  if (props.initialData) return;
  try {
    const data = await $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${props.taskId}`);
    task.value = data;
    subtasks.value = data.subtasks || [];
  } catch { /* task may not exist */ }
  finally { loading.value = false; }
});

async function handleToggle() {
  if (!task.value) return;
  const u = await toggleComplete(task.value.id);
  task.value = { ...task.value, ...u };
}

async function handleSubToggle(sid: string) {
  const u = await toggleComplete(sid);
  const i = subtasks.value.findIndex(s => s.id === sid);
  if (i >= 0) subtasks.value[i] = { ...subtasks.value[i], ...u };
}
</script>
