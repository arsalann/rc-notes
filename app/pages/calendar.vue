<template>
  <div class="max-w-lg mx-auto">
    <div class="sticky top-0 z-30 bg-(--ui-bg)/80 backdrop-blur-lg px-4 pt-5 pb-3 safe-top">
      <div class="flex items-center gap-3">
        <h1 class="text-2xl font-bold tracking-tight">Calendar</h1>
        <WorkspaceSwitcher />
      </div>
    </div>

    <!-- Day selector -->
    <div class="flex gap-2 px-4 mt-3 no-scrollbar overflow-x-auto">
      <button v-for="day in days" :key="day.date" @click="selectedDate = day.date"
        class="flex flex-col items-center flex-1 min-w-16 px-2 py-3 rounded-2xl transition-all duration-200 active:scale-95"
        :class="selectedDate === day.date
          ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
          : day.isToday
            ? 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-primary)/40'
            : 'bg-(--ui-bg-elevated) ring-1 ring-(--ui-border)'">
        <span class="text-[11px] uppercase font-semibold tracking-wide"
          :class="selectedDate === day.date ? 'text-white/70' : 'text-(--ui-text-dimmed)'">{{ day.dayName }}</span>
        <span class="text-xl font-bold mt-1">{{ day.dayNum }}</span>
        <div class="flex gap-1 mt-1.5 h-2">
          <div v-for="i in Math.min(day.taskCount, 4)" :key="i" class="w-1.5 h-1.5 rounded-full"
            :class="selectedDate === day.date ? 'bg-white/60' : 'bg-(--ui-primary)'" />
        </div>
      </button>
    </div>

    <!-- Tasks for selected day -->
    <div class="px-4 mt-6">
      <p class="text-xs font-semibold uppercase tracking-wider text-(--ui-text-dimmed) mb-3">
        {{ selectedDayLabel }}
        <span v-if="selectedTasks.length" class="text-(--ui-text-muted) ml-1">{{ selectedTasks.length }} task{{ selectedTasks.length > 1 ? 's' : '' }}</span>
      </p>
      <div v-if="loading" class="space-y-3">
        <USkeleton v-for="i in 2" :key="i" class="h-18 w-full" />
      </div>
      <div v-else-if="selectedTasks.length" class="space-y-2.5 pb-6">
        <TaskItem v-for="task in selectedTasks" :key="task.id" :task="task" @toggle="handleToggle" />
      </div>
      <EmptyState v-else message="Nothing scheduled for this day." icon="i-lucide-calendar-x" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Task } from '~/composables/useNotes';
const { activeId } = useWorkspace(); const { toggleComplete } = useTasks();
const loading = ref(true); const calendarData = ref<{ date: string; tasks: Task[] }[]>([]); const selectedDate = ref(new Date().toISOString().split('T')[0]);
const days = computed(() => { const r: any[] = []; const dn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; const td = new Date().toISOString().split('T')[0];
  for (let i = -2; i <= 2; i++) { const d = new Date(); d.setDate(d.getDate() + i); const ds = d.toISOString().split('T')[0]; const dd = calendarData.value.find(c => c.date === ds);
    r.push({ date: ds, dayName: dn[d.getDay()], dayNum: d.getDate(), isToday: ds === td, taskCount: dd?.tasks?.length || 0 }); } return r; });
const selectedTasks = computed(() => calendarData.value.find(d => d.date === selectedDate.value)?.tasks || []);
const selectedDayLabel = computed(() => { const td = new Date().toISOString().split('T')[0]; if (selectedDate.value === td) return 'Today';
  const y = new Date(); y.setDate(y.getDate() - 1); if (selectedDate.value === y.toISOString().split('T')[0]) return 'Yesterday';
  const t = new Date(); t.setDate(t.getDate() + 1); if (selectedDate.value === t.toISOString().split('T')[0]) return 'Tomorrow';
  return new Date(selectedDate.value + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }); });
async function fetchCalendar() { loading.value = true; try { const q: Record<string, string> = {}; if (activeId.value) q.workspace_id = activeId.value; calendarData.value = await $fetch<any[]>('/api/calendar', { query: q }); } finally { loading.value = false; } }
onMounted(fetchCalendar); watch(activeId, fetchCalendar);
async function handleToggle(id: string) { await toggleComplete(id); await fetchCalendar(); }
</script>
