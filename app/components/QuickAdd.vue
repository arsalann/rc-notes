<template>
  <div class="px-4">
    <div class="surface-card rounded-2xl overflow-hidden transition-all duration-200" :style="expanded ? 'border-color:#14b8a6' : ''">
      <div class="flex items-center gap-2 px-4 py-3">
        <svg class="w-5 h-5 text-faint flex-shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
        <input ref="titleRef" v-model="title" :placeholder="placeholder" class="flex-1 bg-transparent outline-none text-[15px]"
          @focus="expanded = true" @keydown.enter.prevent="submit" @keydown.escape="collapse" />
      </div>
      <div v-if="expanded" class="px-4 pb-4 space-y-3">
        <div class="flex items-center gap-2">
          <button @click="showDatePicker = !showDatePicker" class="flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors btn-tap"
            :class="dueAt ? 'accent-bg text-white' : 'text-muted'" :style="!dueAt ? 'background-color:#3f3f46' : ''">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
            {{ dueAt ? formatDate(dueAt) : 'Due date' }}
          </button>
          <button v-if="dueAt" @click="dueAt = ''" class="touch-target text-faint"><svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
        </div>
        <div v-if="showDatePicker" class="flex gap-2 flex-wrap">
          <button v-for="opt in dateShortcuts" :key="opt.label" @click="dueAt = opt.value; showDatePicker = false"
            class="px-3 py-1.5 text-[12px] font-medium rounded-lg text-muted btn-tap" style="background-color:#3f3f46">{{ opt.label }}</button>
          <input type="datetime-local" @change="dueAt = ($event.target as HTMLInputElement).value; showDatePicker = false"
            class="px-3 py-1.5 text-[12px] rounded-lg text-muted outline-none" style="background-color:#3f3f46" />
        </div>
        <div v-if="subtasks.length || showSubtaskInput" class="space-y-1.5">
          <div v-for="(sub, i) in subtasks" :key="i" class="flex items-center gap-2 pl-1">
            <div class="w-4 h-4 rounded-full checkbox-unchecked flex-shrink-0" />
            <span class="text-[13px] flex-1">{{ sub }}</span>
            <button @click="subtasks.splice(i, 1)" class="touch-target text-faint"><svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12"/></svg></button>
          </div>
          <div v-if="showSubtaskInput" class="flex items-center gap-2 pl-1">
            <div class="w-4 h-4 rounded-full flex-shrink-0" style="border:2px dashed #71717a" />
            <input ref="subtaskRef" v-model="newSubtask" placeholder="Subtask title" class="flex-1 text-[13px] bg-transparent outline-none text-muted"
              @keydown.enter.prevent="addSubtask" @keydown.escape="showSubtaskInput = false" />
          </div>
        </div>
        <button v-if="!showSubtaskInput" @click="showSubtaskInput = true; nextTick(() => subtaskRef?.focus())"
          class="flex items-center gap-1.5 text-[13px] text-muted font-medium btn-tap pl-1">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
          Add subtask
        </button>
        <div class="flex items-center justify-between pt-1">
          <button @click="collapse" class="text-[13px] text-muted font-medium btn-tap px-2 py-1">Cancel</button>
          <button @click="submit" :disabled="!title.trim()" class="btn-primary text-[13px] px-5 py-2">Add Task</button>
        </div>
      </div>
    </div>
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
