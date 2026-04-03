<template>
  <div class="flex items-start gap-3 p-4 surface-card rounded-2xl btn-tap" :class="task.completed && 'opacity-50'">
    <button @click.prevent="$emit('toggle', task.id)" class="touch-target flex-shrink-0 -ml-2 -mt-1">
      <div class="w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all duration-200"
        :class="task.completed ? 'checkbox-checked' : 'checkbox-unchecked'">
        <svg v-if="task.completed" class="w-3 h-3 text-white" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
        </svg>
      </div>
    </button>
    <NuxtLink :to="`/tasks/${task.id}`" class="flex-1 min-w-0 py-0.5">
      <div class="flex items-center gap-2">
        <span class="text-[15px] font-medium leading-snug" :class="task.completed && 'line-through text-muted'">{{ task.title }}</span>
        <svg v-if="task.pinned" class="w-3.5 h-3.5 flex-shrink-0 text-faint" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10.75 2.567a1.5 1.5 0 0 0-1.5 0L3.456 6.05a1.5 1.5 0 0 0-.75 1.3v6.3a1.5 1.5 0 0 0 .75 1.3l5.794 3.483a1.5 1.5 0 0 0 1.5 0l5.794-3.483a1.5 1.5 0 0 0 .75-1.3v-6.3a1.5 1.5 0 0 0-.75-1.3L10.75 2.567Z"/>
        </svg>
      </div>
      <p v-if="task.description" class="text-[13px] text-muted mt-0.5 line-clamp-1">{{ task.description }}</p>
      <div v-if="hasMeta" class="flex items-center gap-2.5 mt-2 flex-wrap">
        <span v-if="task.due_at" class="inline-flex items-center gap-1 text-[12px] font-medium" :class="isOverdue ? 'accent-text' : 'text-faint'">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"/></svg>
          {{ formatDue(task.due_at) }}
        </span>
        <span v-if="task.subtask_count" class="inline-flex items-center gap-1 text-[12px] text-faint font-medium">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>
          {{ task.subtask_done }}/{{ task.subtask_count }}
        </span>
        <span v-for="tag in (task.tags || []).slice(0, 2)" :key="tag" class="tag">{{ tag }}</span>
      </div>
    </NuxtLink>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useNotes';
const props = defineProps<{ task: Task }>();
defineEmits<{ toggle: [id: string] }>();
const isOverdue = computed(() => { if (!props.task.due_at || props.task.completed) return false; return new Date(props.task.due_at) < new Date(); });
const hasMeta = computed(() => props.task.due_at || props.task.subtask_count || props.task.tags?.length);
function formatDue(dateStr: string) { const d = new Date(dateStr); const now = new Date(); const days = Math.ceil((d.getTime()-now.getTime())/86400000); if (days<0) return `${Math.abs(days)}d overdue`; if (days===0) return 'Today'; if (days===1) return 'Tomorrow'; if (days<7) return `${days}d`; return d.toLocaleDateString('en-US',{month:'short',day:'numeric'}); }
</script>
