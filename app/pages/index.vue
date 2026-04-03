<template>
  <div class="max-w-lg mx-auto">
    <div class="flex items-center gap-3 px-4 pt-5 safe-top">
      <h1 class="text-2xl font-bold">Tasks</h1>
      <WorkspaceSwitcher />
    </div>
    <div class="mt-5">
      <QuickAdd placeholder="What needs to be done?" @add="handleAdd" />
    </div>
    <div v-if="loading" class="px-4 mt-5 space-y-3">
      <div v-for="i in 4" :key="i" class="h-[72px] surface-input rounded-2xl animate-pulse" />
    </div>
    <div v-else-if="tasks.length" class="px-4 mt-5 space-y-3 pb-6">
      <TaskItem v-for="task in tasks" :key="task.id" :task="task" @toggle="handleToggle" />
    </div>
    <EmptyState v-else message="No tasks yet — add one above." icon="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
  </div>
</template>

<script setup lang="ts">
const { tasks, loading, fetchTasks, createTask, toggleComplete } = useTasks();
const { activeId } = useWorkspace();
async function load() { await fetchTasks({ workspace_id: activeId.value }); }
onMounted(load); watch(activeId, load);
async function handleAdd(data: { title: string; due_at?: string; subtasks?: string[] }) {
  const task = await createTask({ ...data, workspace_id: activeId.value });
  if (data.subtasks?.length) {
    for (const sub of data.subtasks) await createTask({ title: sub, parent_id: task.id, workspace_id: activeId.value });
    await load();
  }
}
async function handleToggle(id: string) { await toggleComplete(id); }
</script>
