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
          <!-- Quick attribute row: priority, status, due date -->
          <div class="flex items-center gap-1.5 flex-wrap">
            <!-- Priority -->
            <UDropdownMenu :items="priorityMenuItems" :ui="{ content: 'min-w-36' }">
              <UButton :color="currentPriority?.color || 'neutral'" variant="soft" size="sm"
                :icon="currentPriority?.icon || 'i-lucide-flag'" trailing-icon="i-lucide-chevron-down">
                {{ currentPriority?.label || 'Priority' }}
              </UButton>
            </UDropdownMenu>
            <!-- Status -->
            <UDropdownMenu :items="statusMenuItems" :ui="{ content: 'min-w-32' }">
              <UButton :color="currentStatus.color" variant="soft" size="sm"
                icon="i-lucide-circle-dot" trailing-icon="i-lucide-chevron-down">
                {{ currentStatus.label }}
              </UButton>
            </UDropdownMenu>
            <!-- Due date -->
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
import { PRIORITY_OPTIONS, getPriorityOption, type PriorityValue } from '~/composables/usePriority';
import { parseHashtags } from '~/composables/useHashtagParse';

const props = defineProps<{ placeholder?: string; parentId?: string }>();
const emit = defineEmits<{ add: [data: { title: string; parent_id?: string; due_at?: string; subtasks?: string[]; tags?: string[]; priority?: number; status?: string }] }>();
const title = ref(''); const dueAt = ref(''); const subtasks = ref<string[]>([]); const newSubtask = ref('');
const priority = ref<PriorityValue>(2);
const status = ref<'next' | 'now' | 'done'>('next');
const expanded = ref(false); const showDatePicker = ref(false); const showSubtaskInput = ref(false);
const titleRef = ref<HTMLInputElement>(); const subtaskRef = ref<HTMLInputElement>();
import { todayLocal, localDateOffset } from '~/composables/useDate';

const currentPriority = computed(() => getPriorityOption(priority.value));
const priorityMenuItems = computed(() => [
  [
    ...PRIORITY_OPTIONS.map(p => ({
      label: p.label,
      icon: p.icon,
      onSelect: () => { priority.value = p.value; },
    })),
    { label: 'None', icon: 'i-lucide-minus', onSelect: () => { priority.value = 0; } },
  ],
]);

const statusOptions = [
  { value: 'next' as const, label: 'Next', color: 'neutral' as const },
  { value: 'now' as const,  label: 'Now',  color: 'primary' as const },
  { value: 'done' as const, label: 'Done', color: 'success' as const },
];
const currentStatus = computed(() => statusOptions.find(s => s.value === status.value)!);
const statusMenuItems = computed(() => [
  statusOptions.map(s => ({ label: s.label, onSelect: () => { status.value = s.value; } })),
]);
const dateShortcuts = computed(() => [
  { label: 'Today', value: `${todayLocal()}T09:00` },
  { label: 'Tomorrow', value: `${localDateOffset(1)}T09:00` },
  { label: 'Next week', value: `${localDateOffset(7)}T09:00` },
]);

// Reactive parse — drives preview and auto-applies recognized hashtags to the buttons.
const parsed = computed(() => parseHashtags(title.value));
const parsedTags = computed(() => parsed.value.tags);

// When the user types a recognized priority/status/date hashtag, update the corresponding button.
watch(() => parsed.value.priority, v => { if (v !== undefined) priority.value = v as PriorityValue; });
watch(() => parsed.value.status, v => { if (v) status.value = v as 'next' | 'now' | 'done'; });
watch(() => parsed.value.due_at, v => { if (v) dueAt.value = v; });

function addSubtask() { const t=newSubtask.value.trim(); if(t){subtasks.value.push(t);newSubtask.value='';} }
function collapse() { expanded.value=false; showDatePicker.value=false; showSubtaskInput.value=false; }
function submit() { const t=title.value.trim(); if(!t)return;
  const p = parseHashtags(t);
  const finalDue = p.due_at ? new Date(p.due_at).toISOString() : (dueAt.value ? new Date(dueAt.value).toISOString() : undefined);
  const finalPriority = p.priority !== undefined ? p.priority : priority.value;
  const finalStatus = p.status || status.value;
  emit('add',{title:p.title,parent_id:props.parentId,due_at:finalDue,subtasks:subtasks.value.length?[...subtasks.value]:undefined,tags:p.tags.length?p.tags:undefined,priority:finalPriority,status:finalStatus});
  title.value='';dueAt.value='';subtasks.value=[];newSubtask.value='';showSubtaskInput.value=false;showDatePicker.value=false;priority.value=2;status.value='next';collapse(); }
function formatDate(s:string){return new Date(s).toLocaleDateString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});}
</script>
