<template>
  <div>
    <UCard class="transition-all duration-200 hover:ring-(--ui-primary)/20" :class="task.completed && 'opacity-50'" :ui="{ body: 'sm:p-4' }">
      <div class="flex items-start gap-3">
        <UCheckbox
          :model-value="task.completed"
          @update:model-value="$emit('toggle', task.id)"
          class="mt-0.5"
        />
        <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium leading-snug" :class="task.completed && 'line-through text-(--ui-text-muted)'">
              {{ task.title }}
            </span>
            <UIcon v-if="task.pinned" name="i-lucide-pin" class="size-3.5 text-(--ui-text-dimmed)" />
          </div>
          <p v-if="task.description" class="text-xs text-(--ui-text-muted) mt-0.5 line-clamp-1">{{ task.description }}</p>
          <div v-if="hasMeta" class="flex items-center gap-2 mt-2 flex-wrap">
            <UBadge v-if="task.due_at" :color="isOverdue ? 'error' : 'neutral'" variant="subtle" size="xs">
              <UIcon name="i-lucide-clock" class="size-3 mr-1" />
              {{ formatDue(task.due_at) }}
            </UBadge>
            <UBadge v-if="task.subtask_count && !expanded" color="neutral" variant="subtle" size="xs">
              <UIcon name="i-lucide-list-checks" class="size-3 mr-1" />
              {{ task.subtask_done }}/{{ task.subtask_count }}
            </UBadge>
            <UBadge v-for="tag in (task.tags || []).slice(0, 2)" :key="tag" color="neutral" variant="subtle" size="xs">
              {{ tag }}
            </UBadge>
          </div>
        </NuxtLink>
        <UButton v-if="task.subtask_count" color="neutral" variant="ghost" size="xs"
          :icon="expanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          @click.prevent="toggleExpand" class="shrink-0 mt-0.5" />
      </div>
    </UCard>

    <!-- Inline subtasks tree -->
    <div v-if="expanded && subtasks.length" class="ml-8 pl-3 border-l border-(--ui-border) mt-1 mb-1 space-y-0.5">
      <div v-for="sub in subtasks" :key="sub.id"
        class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg transition-colors hover:bg-(--ui-bg-elevated)">
        <UCheckbox :model-value="sub.completed" @update:model-value="handleSubToggle(sub)" size="xs" />
        <NuxtLink :to="`/tasks/${sub.id}`" class="flex-1 min-w-0 text-sm transition-all duration-200"
          :class="sub.completed && 'line-through text-(--ui-text-muted)'">
          {{ sub.title }}
        </NuxtLink>
      </div>
    </div>
    <div v-if="expanded && loadingSubs" class="ml-8 pl-3 border-l border-(--ui-border) mt-1 mb-1 py-3">
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin text-(--ui-text-dimmed)" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useNotes';
const props = defineProps<{ task: Task }>();
const emit = defineEmits<{ toggle: [id: string] }>();

const expanded = ref(false);
const subtasks = ref<Task[]>([]);
const loadingSubs = ref(false);

const { toggleComplete } = useTasks();

const isOverdue = computed(() => { if (!props.task.due_at || props.task.completed) return false; return new Date(props.task.due_at) < new Date(); });
const hasMeta = computed(() => props.task.due_at || props.task.subtask_count || props.task.tags?.length);

async function toggleExpand() {
  expanded.value = !expanded.value;
  if (expanded.value && !subtasks.value.length) {
    loadingSubs.value = true;
    try {
      const data = await $fetch<Task & { subtasks: Task[] }>(`/api/tasks/${props.task.id}`);
      subtasks.value = data.subtasks || [];
    } finally {
      loadingSubs.value = false;
    }
  }
}

async function handleSubToggle(sub: Task) {
  const u = await toggleComplete(sub.id);
  const i = subtasks.value.findIndex(s => s.id === sub.id);
  if (i >= 0) subtasks.value[i] = { ...subtasks.value[i], ...u };
}

function formatDue(dateStr: string) { const d = new Date(dateStr); const now = new Date(); const days = Math.ceil((d.getTime()-now.getTime())/86400000); if (days<0) return `${Math.abs(days)}d overdue`; if (days===0) return 'Today'; if (days===1) return 'Tomorrow'; if (days<7) return `${days}d`; return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
</script>
