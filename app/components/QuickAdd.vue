<template>
  <div class="px-4">
    <UCard :ui="{ body: 'sm:p-0' }" :class="expanded && 'ring-(--ui-primary)'">
      <div class="flex items-center gap-2.5 px-4 py-3">
        <UIcon name="i-lucide-plus" class="size-5 text-(--ui-text-dimmed) shrink-0" />
        <input ref="titleRef" v-model="title" :placeholder="placeholder"
          class="flex-1 bg-transparent outline-none text-sm placeholder:text-(--ui-text-dimmed)"
          @focus="expanded = true" @keydown.enter.prevent="submit" @keydown.escape="collapse" />
      </div>
      <template v-if="expanded">
        <USeparator />
        <div class="px-4 py-3 space-y-3">
          <div class="flex items-center gap-2">
            <UButton :color="dueAt ? 'primary' : 'neutral'" variant="soft" size="xs" icon="i-lucide-calendar"
              @click="showDatePicker = !showDatePicker">
              {{ dueAt ? formatDate(dueAt) : 'Due date' }}
            </UButton>
            <UButton v-if="dueAt" color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="dueAt = ''" />
          </div>
          <div v-if="showDatePicker" class="flex gap-2 flex-wrap">
            <UButton v-for="opt in dateShortcuts" :key="opt.label" color="neutral" variant="soft" size="xs"
              @click="dueAt = opt.value; showDatePicker = false">{{ opt.label }}</UButton>
            <input type="datetime-local" @change="dueAt = ($event.target as HTMLInputElement).value; showDatePicker = false"
              class="px-2 py-1 text-xs rounded-md bg-(--ui-bg-elevated) text-(--ui-text-muted) outline-none" />
          </div>
          <div v-if="subtasks.length || showSubtaskInput" class="space-y-1.5">
            <div v-for="(sub, i) in subtasks" :key="i" class="flex items-center gap-2 pl-1">
              <UCheckbox disabled />
              <span class="text-xs flex-1">{{ sub }}</span>
              <UButton color="neutral" variant="ghost" size="xs" icon="i-lucide-x" @click="subtasks.splice(i, 1)" />
            </div>
            <div v-if="showSubtaskInput" class="flex items-center gap-2 pl-1">
              <UIcon name="i-lucide-circle-dashed" class="size-4 text-(--ui-text-dimmed)" />
              <input ref="subtaskRef" v-model="newSubtask" placeholder="Subtask title"
                class="flex-1 text-xs bg-transparent outline-none text-(--ui-text-muted)"
                @keydown.enter.prevent="addSubtask" @keydown.escape="showSubtaskInput = false" />
            </div>
          </div>
          <UButton v-if="!showSubtaskInput" color="neutral" variant="ghost" size="xs" icon="i-lucide-plus"
            @click="showSubtaskInput = true; nextTick(() => subtaskRef?.focus())">Add subtask</UButton>
          <div class="flex items-center justify-between pt-1">
            <UButton color="neutral" variant="ghost" size="xs" @click="collapse">Cancel</UButton>
            <UButton color="primary" size="xs" :disabled="!title.trim()" @click="submit">Add Task</UButton>
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ placeholder?: string; parentId?: string }>();
const emit = defineEmits<{ add: [data: { title: string; parent_id?: string; due_at?: string; subtasks?: string[] }] }>();
const title = ref(''); const dueAt = ref(''); const subtasks = ref<string[]>([]); const newSubtask = ref('');
const expanded = ref(false); const showDatePicker = ref(false); const showSubtaskInput = ref(false);
const titleRef = ref<HTMLInputElement>(); const subtaskRef = ref<HTMLInputElement>();
const dateShortcuts = computed(() => { const t=new Date(); const tm=new Date(t); tm.setDate(tm.getDate()+1); const nw=new Date(t); nw.setDate(nw.getDate()+7);
  const f=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T09:00`;
  return [{label:'Today',value:f(t)},{label:'Tomorrow',value:f(tm)},{label:'Next week',value:f(nw)}]; });
function addSubtask() { const t=newSubtask.value.trim(); if(t){subtasks.value.push(t);newSubtask.value='';} }
function collapse() { expanded.value=false; showDatePicker.value=false; showSubtaskInput.value=false; }
function submit() { const t=title.value.trim(); if(!t)return;
  emit('add',{title:t,parent_id:props.parentId,due_at:dueAt.value?new Date(dueAt.value).toISOString():undefined,subtasks:subtasks.value.length?[...subtasks.value]:undefined});
  title.value='';dueAt.value='';subtasks.value=[];newSubtask.value='';showSubtaskInput.value=false;showDatePicker.value=false;collapse(); }
function formatDate(s:string){return new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
</script>
