<template>
  <div class="px-4">
    <UCard :ui="{ body: 'p-0' }" :class="expanded && 'ring-(--ui-primary)'">
      <div class="flex items-center gap-2.5 px-4 py-3.5">
        <UIcon name="i-lucide-plus" class="size-5 text-(--ui-text-dimmed) shrink-0" />
        <input ref="titleRef" v-model="title" :placeholder="placeholder"
          class="flex-1 bg-transparent outline-none placeholder:text-(--ui-text-dimmed)"
          @focus="expanded = true" @keydown.enter.prevent="submit" @keydown.escape="collapse" />
      </div>
      <div v-if="parsedTags.length" class="flex items-center gap-1.5 px-4 pb-2 -mt-1 flex-wrap">
        <UBadge v-for="tag in parsedTags" :key="tag" color="primary" variant="subtle" size="xs">{{ tag }}</UBadge>
      </div>
      <template v-if="expanded">
        <USeparator />
        <div class="px-4 py-3.5 space-y-3">
          <div class="flex items-center gap-2">
            <UButton :color="dueAt ? 'primary' : 'neutral'" variant="soft" size="sm" icon="i-lucide-calendar"
              @click="showDatePicker = !showDatePicker">
              {{ dueAt ? formatDate(dueAt) : 'Due date' }}
            </UButton>
            <UButton v-if="dueAt" color="neutral" variant="ghost" size="sm" icon="i-lucide-x" @click="dueAt = ''" />
          </div>
          <div v-if="showDatePicker" class="flex gap-2 flex-wrap">
            <UButton v-for="opt in dateShortcuts" :key="opt.label" color="neutral" variant="soft" size="sm"
              @click="dueAt = opt.value; showDatePicker = false">{{ opt.label }}</UButton>
            <input type="datetime-local" @change="dueAt = ($event.target as HTMLInputElement).value; showDatePicker = false"
              class="px-3 py-2 rounded-lg bg-(--ui-bg-elevated) text-(--ui-text-muted) outline-none" />
          </div>
          <div v-if="subtasks.length || showSubtaskInput" class="space-y-2">
            <div v-for="(sub, i) in subtasks" :key="i" class="flex items-center gap-2 pl-1 py-0.5">
              <UCheckbox disabled />
              <span class="text-sm flex-1">{{ sub }}</span>
              <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-x" @click="subtasks.splice(i, 1)" />
            </div>
            <div v-if="showSubtaskInput" class="flex items-center gap-2 pl-1">
              <UIcon name="i-lucide-circle-dashed" class="size-4 text-(--ui-text-dimmed)" />
              <input ref="subtaskRef" v-model="newSubtask" placeholder="Subtask title"
                class="flex-1 bg-transparent outline-none text-(--ui-text-muted)"
                @keydown.enter.prevent="addSubtask" @keydown.escape="showSubtaskInput = false" />
            </div>
          </div>
          <UButton v-if="!showSubtaskInput" color="neutral" variant="ghost" size="sm" icon="i-lucide-plus"
            @click="showSubtaskInput = true; nextTick(() => subtaskRef?.focus())">Add subtask</UButton>
          <div class="flex items-center justify-between pt-2">
            <UButton color="neutral" variant="ghost" size="sm" @click="collapse">Cancel</UButton>
            <UButton color="primary" size="sm" :disabled="!title.trim()" @click="submit">Add Task</UButton>
          </div>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{ placeholder?: string; parentId?: string }>();
const emit = defineEmits<{ add: [data: { title: string; parent_id?: string; due_at?: string; subtasks?: string[]; tags?: string[] }] }>();
const title = ref(''); const dueAt = ref(''); const subtasks = ref<string[]>([]); const newSubtask = ref('');
const expanded = ref(false); const showDatePicker = ref(false); const showSubtaskInput = ref(false);
const titleRef = ref<HTMLInputElement>(); const subtaskRef = ref<HTMLInputElement>();
import { todayLocal, localDateOffset } from '~/composables/useDate';
const dateShortcuts = computed(() => [
  { label: 'Today', value: `${todayLocal()}T09:00` },
  { label: 'Tomorrow', value: `${localDateOffset(1)}T09:00` },
  { label: 'Next week', value: `${localDateOffset(7)}T09:00` },
]);

// Extract #tags from title text
function extractTags(text: string): { title: string; tags: string[] } {
  const tags: string[] = [];
  const cleaned = text.replace(/#(\w[\w-]*)/g, (_, tag) => { tags.push(tag.toLowerCase()); return ''; }).replace(/\s{2,}/g, ' ').trim();
  return { title: cleaned, tags: [...new Set(tags)] };
}

// Show inline tag preview
const parsedTags = computed(() => extractTags(title.value).tags);

function addSubtask() { const t=newSubtask.value.trim(); if(t){subtasks.value.push(t);newSubtask.value='';} }
function collapse() { expanded.value=false; showDatePicker.value=false; showSubtaskInput.value=false; }
function submit() { const t=title.value.trim(); if(!t)return;
  const { title: cleanTitle, tags } = extractTags(t);
  emit('add',{title:cleanTitle,parent_id:props.parentId,due_at:dueAt.value?new Date(dueAt.value).toISOString():undefined,subtasks:subtasks.value.length?[...subtasks.value]:undefined,tags:tags.length?tags:undefined});
  title.value='';dueAt.value='';subtasks.value=[];newSubtask.value='';showSubtaskInput.value=false;showDatePicker.value=false;collapse(); }
function formatDate(s:string){return new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
</script>
